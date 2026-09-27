---
source: src/modules/access/tests/integration/access.test.ts
sha256: ccc892e80aeb96fa057522911383d110a29a49b4170c7e346095eb33de6e0b25
generated_at: 2026-09-27T14:21:35.723315+00:00
model: ollama:qwen3.8:27b
---

# src/modules/access/tests/integration/access.test.ts

## Purpose

Integration tests for the access module's **membership storage layer** (write, edit, refuse) against an in-memory MongoDB wired up by `setupTestDb`. It verifies that the collection from which authorization decisions are *read* can be correctly written to, edited, and rejected — distinct from `tests/cross-cutting/authorization-conformance.test.ts`, which proves two backends decide identically.

## Key elements

- **`describe('the preset roles')`** — asserts `permissionsOfRole` resolves from `shared/authorization-roles.yaml` with zero database involvement.
- **`describe('membership across tenants')`** — verifies one person can hold different roles in different tenants, one-role-per-tenant uniqueness (reassignment replaces, not appends), and platform/tenant scope separation.
- **`describe('the invariants')`** — the core refusal battery: undeclared role names throw `AccessInvariantError`; privilege-escalation grants are refused; a granter can hand over exactly what they hold; revoking the last admin is permitted; a failing `deleteById` propagates to the caller rather than vanishing as an unhandled rejection.
- **`describe('bootstrapAccessModel')`** — creates the deployment tenant with no accounts; confirms idempotency (second call keeps the first `_id`, ignores the new name).
- **`describe('a role lives in exactly one place, the membership row')`** — no membership → `null` roles (not a guess); `assignDefaultRole` can only ever grant `unverified` (type-level guard, no role-name parameter); undeclared role names rejected.
- **`describe('auditing a role change')`** — asserts `emitAuditEvent` fires with the correct `action`, `outcome`, `actor_user_id`, `target_id`, and `metadata` for successful grants, refused escalations, and revocations.
- **`jest.mock('@infrastructure/observability/audit', …)`** — full module replacement (not a spy): swaps `emitAuditEvent` for a `jest.fn()` and manually reroutes `recordAudit` through that fn, because `recordAudit` closes over its own module-scoped `emitAuditEvent`.

## Relationships

- **`src/modules/access/service.ts`** — primary SUT; all assign/revoke/bootstrap/resolve functions are imported from here.
- **`src/modules/access/repository.ts`** — `membershipRepository.deleteById` is spied on to simulate a storage failure.
- **`src/modules/access/audit.ts`** — provides `accessAuditActions` constants used in audit assertions.
- **`src/kernel/permissions.ts`** — `permissionsOfRole` is called to resolve preset permissions and to build the granter's key set in escalation tests.
- **`src/kernel/access/tenant.ts`** — `DEPLOYMENT_TENANT_ID` is imported (used alongside the service's `DEPLOYMENT_TENANT_SLUG`).
- **`src/infrastructure/observability/audit.ts`** — the module under mock; `emitAuditEvent` is replaced, `recordAudit` is rerouted.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the in-memory Mongo before all suites.
- **`tests/support/ports.ts`** — `observePort` wraps the mocked `emitAuditEvent` for assertion.
- **`tests/support/callers.ts`** — `testCallerContext` and `callerContextAs` build caller identities for audit-related tests.

## Notes

- **Audit mock is a replacement, not a spy.** `recordAudit` internally calls the *original* `emitAuditEvent` via closure, so a plain `jest.spyOn` would not intercept it. The factory manually re-exports a `recordAudit` that calls the mocked `emitAuditEvent`. See `tests/support/ports.ts` for the convention.
- **`afterEach(() => jest.restoreAllMocks())`** runs globally in this file; individual spies (e.g. `deleteById`) must also be restored explicitly if you add scoped mocks.
- **Preset roles are YAML-only.** There is no database row to seed, edit, or delete for a role definition. `permissionsOfRole` is a pure file lookup at import time. Tests that previously exercised `deleteRole` have been removed.
- **`assignDefaultRole` is structurally limited to `unverified`** — the function signature has no role-name parameter, so the test merely confirms the runtime value rather than guarding against a caller mistake.
- The file's own docblock explicitly positions it as the *storage* test; the *decision* test lives in `tests/cross-cutting/authorization-conformance.test.ts`, and the *system-level* demo-seeding test is in `tests/integration/access.test.ts` (this file's sibling in the integration directory).
