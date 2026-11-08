---
source: src/modules/users/tests/integration/hierarchy.test.ts
sha256: d9c9c0b8aa53ee3fdff9042c3d720ec58b7b869e8bf0924b31f780cd747c1ed6
generated_at: 2026-11-08T08:54:36.830216+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/hierarchy.test.ts

## Purpose

Integration tests for the "who may change whom" rules enforced by `userService`. Covers three axes: activate/deactivate, protection of accounts that hold a staff role (only `assign:Role` holders may modify them, self excepted), and granting/revoking a role. Driven at the service layer so each case names the caller's role and the target's held role explicitly; the route-level cross-cutting matrix lives elsewhere.

## Key elements

- **`accountHolding(role, name?)`** – Creates a user with the given tenant role via `createUser`; returns the persisted user.
- **`stored(id)` / `activeOf(id)` / `usernameOf(id)`** – Read-back helpers over `userRepository.findById` used to assert that a refusal left the record unchanged.
- **`heldRole(id)`** – Queries `accessService.rolesOf(id, DEPLOYMENT_TENANT_ID)` to confirm the tenant role after an operation.
- **`refusalCode(result)`** – Asserts `success === false`, then returns the first error `code` from the `ResponseReject` shape.
- **`describe('activate and deactivate')`** – Verifies moderator/admin can toggle `active`, 409 on repeat, 404 on missing id, and 403 (`ROLE_MANAGEMENT_REQUIRED`) when a non-role-manager targets a protected account.
- **`describe('the protection of staff accounts')`** – Table-driven matrix of caller-role × held-role combinations for `updateById`; also asserts audit emission on refusal, self-edit exemption, platform-operator special case, multi-scope protection, and application to soft/hard delete + restore.
- **`describe('handing out a staff role')`** – Confirms only `admin` (role-manager) can grant or revoke a tenant role; non-managers get 403 and nothing is written; resending the already-held role is a no-op success.

## Relationships

- **`@modules/users/services` (userService)** – The system under test; all operations are called through it.
- **`@modules/users/tests/factories`** – `createUser` and `userRepository` provide the fixture creation and the read-back assertions.
- **`@modules/access/index` → `@modules/access/services`** – `accessService.rolesOf` is used to verify role grants/revokes.
- **`@modules/access/tests/factories`** – `seedMembership` adds a platform-scope `operator` membership to test multi-scope protection.
- **`@kernel/access/tenant`** – `DEPLOYMENT_TENANT_ID` scopes the `rolesOf` lookup.
- **`@infrastructure/http/response`** – `ResponseReject` type is used to cast failed results and extract `.errors[0].code`.
- **`@infrastructure/observability/audit`** – Fully mocked via `jest.mock`; `observePort(auditPort.emitAuditEvent)` provides a spy to assert the `security.forbidden` audit record.
- **`tests/support/callers`** – `callerContextAs(role, callerId)` builds the caller context passed to every `userService` call.
- **`tests/support/ports`** – Supplies `observePort` (spy wrapper) and `auditPortMock` (the factory consumed by `jest.mock`).
- **`tests/support/setup-test-db`** – `setupTestDb()` initialises the in-memory database before any test runs.

## Notes

- The audit port is **replaced**, not spied: `jest.mock` swaps the entire module with `auditPortMock()`. Individual test calls then get a real spy via `observePort`.
- `callerContextAs(role, 'someone-else')` is the conventional way to indicate "a different user than the target"; passing the target's own id exercises the self-edit exception.
- The test file explicitly defers route-level cross-cutting account-protection checks to a separate suite; don't look for HTTP status-code matrix coverage here.
- `seedMembership` with `scope: null` and `role: 'platform'` models a platform-scope operator; the tests verify that protection applies in **either** scope (tenant or platform).
