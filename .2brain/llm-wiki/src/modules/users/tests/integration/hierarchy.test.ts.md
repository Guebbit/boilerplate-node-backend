---
source: src/modules/users/tests/integration/hierarchy.test.ts
sha256: d9c9c0b8aa53ee3fdff9042c3d720ec58b7b869e8bf0924b31f780cd747c1ed6
generated_at: 2026-10-29T06:20:43.586199+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/hierarchy.test.ts

## Purpose

Integration tests that verify the role-hierarchy rules enforced by `userService` when one account modifies another: which callers may activate/deactivate, edit, delete, restore, or assign/remove a role on a target that holds a staff role. Tests are driven at the service layer (not the HTTP route) so each case names the caller's role and the target's held role explicitly.

## Key elements

- **`accountHolding(role, name?)`** – Creates a user with a given tenant role and a unique email; returns the created user.
- **`stored(id)` / `activeOf(id)` / `usernameOf(id)`** – Read-back helpers that fetch the persisted user to confirm a refusal left the record unchanged.
- **`heldRole(id)`** – Queries `accessService.rolesOf` with `DEPLOYMENT_TENANT_ID` to assert the current tenant role.
- **`refusalCode(result)`** – Asserts `result.success === false` and returns `errors[0].code` from the `ResponseReject` shape.
- **`describe('activate and deactivate')`** – Covers success, idempotency refusal codes (`USER_ALREADY_ACTIVE` / `USER_ALREADY_INACTIVE`), 404 for missing accounts, and protection of a staff-held account.
- **`describe('the protection of staff accounts')`** – Parameterised matrix of caller-role × held-role → allow/refuse for `updateById`; verifies audit event emission on refusal; confirms self-edit is always allowed; tests platform-operator account protection; covers soft-delete, hard-delete, and restore paths.
- **`describe('handing out a staff role')`** – Verifies that granting/revoking a role requires role-management permission, that a save may resend the already-held role, and that no role is written when the caller lacks permission.

## Relationships

- **`src/modules/users/services/index.ts`** (`userService`) – The system under test; all assertions go through its `activate`, `deactivate`, `updateById`, `removeById`, and `restoreById` methods.
- **`src/modules/users/tests/factories.ts`** (`createUser`, `userRepository`) – Seeding and read-back for the target account.
- **`src/modules/access/tests/factories.ts`** (`seedMembership`) – Seeds platform-scope memberships (e.g. `platform/operator`) to test cross-scope protection.
- **`src/modules/access/index.ts`** (`accessService`) – Used by `heldRole` to verify the persisted role after an operation.
- **`src/infrastructure/observability/audit.ts`** – Mocked via `jest.mock`; the audit spy asserts a `security.forbidden` event is emitted when a staff account is protected.
- **`tests/support/ports.ts`** (`observePort`, `auditPortMock`) – Provides the port-replacement mechanism and the spy handle for audit verification.
- **`tests/support/callers.ts`** (`callerContextAs`) – Builds the caller identity context (role + user id) passed to every `userService` call.
- **`tests/support/setup-test-db.ts`** – Initialises the in-memory database for the suite.
- **`src/infrastructure/http/response.ts`** (`ResponseReject`) – Type used to extract the error-code from a failed result.
- **`src/kernel/access/tenant.ts`** (`DEPLOYMENT_TENANT_ID`) – Tenant scope identifier for role lookups.

## Notes

- The audit port is **replaced** (via `jest.mock` + `requireActual` on `@tests/ports`), not spied on with `jest.spyOn`. The spy is obtained with `observePort(auditPort.emitAuditEvent)`.
- The parameterised protection matrix uses `it.each` with a flat `[caller, held, expected]` triple; "allowed" is the string sentinel, everything else is an error code.
- The platform-operator test seeds a `platform`-scope membership with `seedMembership(id, null, 'platform', 'operator')`; this means the operator account is protected even though its tenant role is `customer`, and only an `admin` caller can edit it.
- `callerContextAs(role, id)` takes the caller's user id as the second argument; passing `'someone-else'` (a non-matching id) ensures the self-edit exemption does not apply.
- The `refusalCode` helper calls `expect` internally, so it both asserts failure and extracts the code in one step—using it on a successful result will throw.
