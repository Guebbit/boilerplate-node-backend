---
source: src/modules/access/tests/integration/access.test.ts
sha256: bd3e89b7c16d4b228db6ade07596f1654f379e3f042c3fc9ef64d94e72d681cf
generated_at: 2026-11-08T03:58:51.568484+00:00
model: ollama:qwen3.8:27b
---

# src/modules/access/tests/integration/access.test.ts

## Purpose

Integration test suite for the access module's **storage layer** (membership rows in the in-memory Mongo wired up by `setupTestDb`). It verifies that the module's writers (`services/`, `repository.ts`) correctly create, replace, and refuse membership records, that the invariants those writers enforce are enforced, and that audit events are emitted for role changes. It is the storage-level counterpart to `tests/cross-cutting/authorization-conformance.test.ts` (which proves both backends *decide* the same way); this file proves the data those decisions read *from* behaves correctly.

## Key elements

- **`setupTestDb()`** — initialises the in-memory MongoDB before the suite; called once at module scope.
- **`jest.mock('@infrastructure/observability/audit', …)`** — *replaces* the audit port with `auditPortMock()` (not a spy), so all audit emissions are observable and non-persistent.
- **`describe('the preset roles')`** — confirms `permissionsOfRole` resolves from the shared YAML with zero DB involvement.
- **`describe('membership across tenants')`** — multi-tenant role holding, single-role-per-scope replacement semantics, and platform-vs-tenant scope separation.
- **`describe('the invariants')`** — the bulk of the suite: refuses undeclared roles, privilege-escalation grants, empty key-set grants, anonymous/unauthorised revokes, and asserts that a rejecting `deleteById` surfaces to the caller rather than vanishing.
- **`describe('bootstrapAccess')`** — idempotent tenant creation; no accounts are seeded by bootstrap alone.
- **`describe('a role lives in exactly one place…')`** — null membership resolves to `null` roles; audience tokens (`customer`, `unverified`, `guest`) are rejected by `assignRole`.
- **`describe('auditing a role change')`** — verifies `emitAuditEvent` is called with actor, target, role, and outcome for successful and failed operations.

## Relationships

- **`src/modules/access/services/index.ts`** — primary SUT: `accessService` (ensure/assign/revoke/bootstrap), `AccessInvariantError`, `assertCanGrant`, `DEPLOYMENT_TENANT_SLUG`.
- **`src/modules/access/repository.ts`** — `membershipRepository` is imported and spied on (`deleteById`) to simulate a storage failure.
- **`src/kernel/permissions.ts`** — `permissionsOfRole` supplies the canonical key sets used as grant arguments and as the "granter holds" baseline.
- **`src/kernel/access/tenant.ts`** — `DEPLOYMENT_TENANT_ID` constant for platform-scope assertions.
- **`src/modules/access/audit.ts`** — `accessAuditActions` provides the stable action strings asserted in audit-event expectations.
- **`src/infrastructure/observability/audit.ts`** — the real module is *replaced* (not spied) via `jest.mock`; actual calls are captured through `observePort`.
- **`src/infrastructure/runtime/database.ts`** — `withTransaction` is imported (used by service-internal writes).
- **`tests/support/setup-test-db.ts`** — `setupTestDb` boots the in-memory Mongo.
- **`tests/support/ports.ts`** — `observePort` for reading mock call logs; `auditPortMock` for the replacement.
- **`tests/support/callers.ts`** — `testCallerContext` (anonymous) and `callerContextAs('admin' | 'moderator')` fabricate caller identity for authorisation checks.
- **`src/modules/access/tests/factories.ts`** — `seedMembership` inserts known membership rows without going through the service layer.

## Notes

- The audit port is **replaced, not spied**: the file's own comment links to `tests/support/ports.ts` for the rationale. Do not add a second `jest.spyOn` on the same module; use `observePort` to read emitted events.
- `afterEach(() => jest.restoreAllMocks())` runs after every test, so any `jest.spyOn` set up inside a test (e.g. `membershipRepository.deleteById`) is automatically cleaned up — the one explicit `spy.mockRestore()` in the "surfaces a rejecting delete" test is belt-and-suspenders.
- The module doc-comment explicitly warns that this suite and the cross-cutting conformance suite answer *different* questions. Do not duplicate conformance assertions here.
- `assignRole` signature: the last argument is the **granter's key set** (an array of permission strings), not the target's role permissions. Passing `[]` or a subset the granter doesn't hold triggers the invariant rejection.
