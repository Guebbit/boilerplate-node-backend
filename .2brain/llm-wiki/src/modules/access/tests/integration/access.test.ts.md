---
source: src/modules/access/tests/integration/access.test.ts
sha256: c2a5ae2d0f8acc1507345ca1319dcca443150d9227815e3b5642617b85ffea38
generated_at: 2026-11-14T18:28:55.207413+00:00
model: ollama:qwen3.8:27b
---

# src/modules/access/tests/integration/access.test.ts

## Purpose

Integration test suite that exercises the authorization module's **storage and writer layer** against an in-memory MongoDB (wired up by `setupTestDb`). It verifies that membership rows can be created, reassigned, and refused correctly, that every invariant enforced by the services is actually executable, and that `bootstrapAccess` behaves idempotently. It is deliberately distinct from the cross-cutting conformance suite: this file proves the data *can be written*, not that two backends *decide the same way*.

## Key elements

- **`describe('the preset roles')`** — asserts `permissionsOfRole` resolves from the shared YAML file with zero database involvement.
- **`describe('membership across tenants')`** — verifies a person can hold different roles in different tenants, enforces one-role-per-person-per-tenant (reassignment replaces), and confirms `platform` vs `tenant` scopes are independent.
- **`describe('the invariants')`** — the core block. Covers: refusal of undeclared roles, refusal of unauthorized grantors (no `assign:Role`), valid grant + read-back, last-admin revocation, revocation by unprivileged / anonymous callers (with audit-failure assertion), empty-key-set grant refusal, and surfacing a rejected `deleteById` instead of swallowing it.
- **`describe('bootstrapAccess')`** — shop creation grants nobody a role; a second call is idempotent and preserves the original `_id` and name.
- **`describe('a role lives in exactly one place, the membership row')`** — no membership ⇒ `null` role (not a default); `assignRole` rejects audience strings (`customer`, `unverified`, `guest`).
- **`describe('auditing a ro…')`** (truncated) — audit-emission assertions for role operations.

## Relationships

- **`src/modules/access/services/index.ts`** — primary SUT; imports `accessService`, `AccessInvariantError`, `DEPLOYMENT_TENANT_SLUG`. Every `it` block calls into `accessService`.
- **`src/modules/access/repository.ts`** — `membershipRepository` is spied on to simulate a `deleteById` rejection.
- **`src/modules/access/audit.ts`** — `accessAuditActions` used to assert the `action` field in emitted audit events.
- **`src/kernel/permissions.ts`** — `permissionsOfRole` provides the key-set passed as the granter argument to `assignRole`.
- **`src/kernel/access/tenant.ts`** — `DEPLOYMENT_TENANT_ID` / `DEPLOYMENT_TENANT_SLUG` constants.
- **`src/infrastructure/observability/audit.ts`** — imported as `auditPort`; the module is replaced at load time with `auditPortMock()` from the test ports so that assertions in this file observe emitted events without hitting the real transport.
- **`tests/support/ports.ts`** — provides `auditPortMock()` (the replacement for the audit module above) and `observePort()` for capturing emitted audit events.
- **`tests/support/callers.ts`** — `testCallerContext` (anonymous) and `callerContextAs(role)` build the granter identity for each invocation.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called once at module scope to create the in-memory Mongo.
- **`src/modules/access/tests/factories.ts`** — `seedMembership` helper inserts rows directly, bypassing the service for setup.
- **`src/infrastructure/runtime/database.ts`** — `withTransaction` imported (available for transactional test paths).
- **`src/modules/access/services/grants.ts`** — part of the `accessService` surface; not directly imported but exercised through the service.

## Notes

- The audit port is **replaced** (module-level mock pointing at `tests/support/ports.ts`), not spied on. See `tests/support/ports.ts` for the rationale.
- `setupTestDb()` runs at **module top-level**, not inside a `beforeAll`; the in-memory Mongo is created once for the entire file.
- `afterEach` restores all mocks (`jest.restoreAllMocks()`), but the audit mock is a module-level replace and is not affected by that call.
- The "one role per person per tenant" invariant is enforced by the **repository/service** (upsert semantics), not by a unique index visible in tests; the test asserts the observable result (length 1 after two `seedMembership` calls with different roles).
- The `deleteById` rejection test documents a historical bug: the call was previously fired-and-forgotten (`void`), turning a rejection into an unhandled-promise warning.
- `withTransaction` is imported but does not appear in the visible portion of the file; it may be used in the truncated auditing section.
