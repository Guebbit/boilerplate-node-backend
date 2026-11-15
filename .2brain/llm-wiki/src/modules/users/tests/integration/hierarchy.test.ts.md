---
source: src/modules/users/tests/integration/hierarchy.test.ts
sha256: 0284b02cc614df0e0cfac6378fe3a98a0c3dd1d43c188b59acbb05bcdf00ff07
generated_at: 2026-11-14T22:34:42.013352+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/hierarchy.test.ts

## Purpose

Integration tests for the role-hierarchy rules enforced by `userService`: which caller roles may activate/deactivate, edit, delete, restore, or assign/revoke roles on accounts that hold a staff role, and what error codes result when they may not. Tests are driven through the service layer (not the HTTP route) so each case explicitly names the caller's role and the target's held role.

## Key elements

- **`accountHolding(role, name?)`** — creates a user via `createUser` factory and returns it; distinct email per call.
- **`stored(id)` / `activeOf(id)` / `usernameOf(id)`** — read back the persisted account (or a single field) to assert a refusal left state unchanged.
- **`heldRole(id)`** — queries `accessService.rolesOf` with `DEPLOYMENT_TENANT_ID` to read the tenant role.
- **`refusalCode(result)`** — asserts `result.success === false` and returns `errors[0].code` from a `ResponseReject`.
- **`someoneElse(role)`** — shorthand for `callerContextAs(role, 'someone-else')` (non-own-account caller).
- **`describe('activate and deactivate')`** — moderator/admin permissions on the `active` flag, 409 on repeat, 404 on missing id, refusal on protected accounts.
- **`describe('the protection of staff accounts')`** — parameterised matrix (`it.each`) of caller-role × held-role → allow/refuse; verifies no state change + audit event on refusal; tests self-edit, platform-operator protection, dual-scope roles, and soft/hard-delete + restore.
- **`describe('the role door')`** — `assignUserRole` / `revokeUserRole` access, last-write-wins on reassignment, 409 on idempotent repeat with no audit write, refusal without role management.
- **`jest.mock('@infrastructure/observability/audit', …)`** — replaces the audit port with `auditPortMock()` from `tests/support/ports`; individual tests call `observePort(auditPort.emitAuditEvent)` to spy.

## Relationships

- **`src/modules/users/services/index.ts`** — the system under test; every assertion exercises a `userService` method.
- **`src/modules/users/tests/factories.ts`** — provides `createUser` (account seeding) and `userRepository` (direct state reads).
- **`src/modules/access/tests/factories.ts`** — `seedMembership` grants a platform-scope role to test cross-scope protection.
- **`src/modules/access/index.ts`** — exports `accessService`, used to verify the target account's current role after an operation.
- **`src/kernel/access/tenant.ts`** — `DEPLOYMENT_TENANT_ID` scopes the role query to the deployment tenant.
- **`tests/support/callers.ts`** — `callerContextAs(role, id?)` builds the caller identity for each service call.
- **`tests/support/ports.ts`** — `observePort` wraps the mocked audit function for per-test spying; `auditPortMock` is the jest mock factory.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the test database before all tests.
- **`src/infrastructure/http/response.ts`** — `ResponseReject` type used to extract error codes from failed results.
- **`src/infrastructure/observability/audit.ts`** — mocked at module level; `emitAuditEvent` is the function under observation.

## Notes

- The audit port is **replaced** (module-level `jest.mock`), not spied on at the real implementation level. Per-test spying uses `observePort` on the mock.
- The module docstring explicitly states this suite complements (does not replace) a separate route-level cross-cutting account-protection suite.
- `it.each` matrix: a caller is allowed to edit any account whose held role is *strictly below* their own in the hierarchy (support > unverified/customer; moderator > support/customer; admin > all tenant roles). Equal or higher held roles trigger `ROLE_MANAGEMENT_REQUIRED`.
- Platform-operator membership (`seedMembership(id, null, 'platform', 'operator')`) elevates protection so only `admin` may edit, regardless of tenant role.
- The file is truncated in the provided snapshot; the final test in "the role door" is incomplete.
- All refusal tests verify **both** the error code **and** that persisted state is unchanged (and, where relevant, that no audit event was emitted).
