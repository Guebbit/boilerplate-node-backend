---
source: src/modules/users/services/role.ts
sha256: 3b02e128fbfe708769b5fd56686d99d59163f7788ccbe856821ea115310deec4
generated_at: 2026-11-14T22:31:35.089411+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/services/role.ts

## Purpose
The "role door" for existing user accounts: the sole entry points for granting (`assignUserRole`) or removing (`revokeUserRole`) a staff role. Each call is a state change with its own permission gate, idempotency check (409 on no-op), and audit row, executed inside a database transaction so the user stamp and the membership write commit atomically.

## Key elements
- **`assignUserRole(id, role, context)`** — Grants a staff role to an account, replacing any existing one. Flow: load user → `grantRefusalAudited` (permission + refusal audit) → compare held role (lower-cased) → `writeRole` transaction → audit on success. Returns 404, 403, 422, or 409 as appropriate.
- **`revokeUserRole(id, context)`** — Removes the account's staff role, leaving a plain customer. Flow: load user → re-check `assign:Role` ability (defense-in-depth; route already guards this) → confirm a role is held → `writeRole` transaction → audit on success. Returns 404, 403, or 409.
- **`heldRoleOf(user)`** *(internal)* — Reads the tenant role currently on the account via `accessService.rolesOf`.
- **`writeRole(user, membership)`** *(internal)* — Single transaction: `markModified('updatedAt')` on the user doc, saves via `userRepository`, then runs the membership write. Bypasses Mongoose change-detection for the role field.
- **`conflict(code, messageKey)`** *(internal)* — Builds a 409 `ResponseReject` with a localized message.

## Relationships
- **`src/modules/access/index.ts` (`accessService`)** — Core collaborator: `rolesOf` (read current role), `grantRefusalAudited` (permission gate + refusal audit), `assignRole` / `revokeRole` (membership mutation), `auditRoleAssigned` / `auditRoleRevoked` (post-commit audit). Also imports `roleManagementRequired` for the 403 shape.
- **`src/modules/users/repository.ts`** — `userRepository.findById` to load the account; `userRepository.save` inside the transaction to persist the updated stamp.
- **`src/modules/users/model.ts`** — Provides the `UserDocument` type used throughout.
- **`src/modules/users/services/role-refusal.ts`** — `roleRefusalReject` converts a refusal object (from `grantRefusalAudited`) into the HTTP reject shape for `assignUserRole`.
- **`src/kernel/ability.ts`** — `holds` checks whether the caller carries `assign:Role` (used in `revokeUserRole`).
- **`src/kernel/access/tenant.ts`** — `DEPLOYMENT_TENANT_ID` scopes every role read/write/audit to the deployment tenant.
- **`src/infrastructure/runtime/database.ts`** — `withTransaction` wraps the user-save + membership-write pair.
- **`src/infrastructure/http/response.ts`** — `generateSuccess` / `generateReject` shape every return.
- **`src/infrastructure/i18n/index.ts`** — `t` for localized error/success messages.
- **`src/types/auth-context.ts`** — `CallerContext` type passed into both exports.

## Notes
- **Last-write-wins on concurrent re-roles.** There is no optimistic-lock token; two simultaneous `assignUserRole` calls with different roles both succeed and the later write silently overrides the earlier one.
- **Role names are compared lower-cased.** Held roles are stored in lowercase; the incoming `role` parameter is lower-cased only at comparison time, not normalized before storage (the access layer handles normalization on write).
- **`markModified('updatedAt')` is required.** The role lives in the membership document, not the user document, so Mongoose's change tracker would not fire and the user's `updatedAt` would stay stale without the explicit mark.
- **Audit timing differs by outcome.** Failed grants are audited *before* any write (via `grantRefusalAudited`); successful assignments are audited *after* the transaction commits. This is intentional: a failed grant should not leave a pending audit row tied to an uncommitted write.
- **`revokeUserRole` re-checks the ability** even though the route layer already enforces it — the comment notes this is so the door cannot be reached "around" the route guard.
- **`writeRole` is `@internal`.** Its JSDoc explicitly warns it performs no caller-permission check; it must only be invoked from behind the two public doors.
