# src/modules/users/controllers/delete-users.ts

## Purpose

Thin controller layer for the two admin user-deletion endpoints (`DELETE /users` and `DELETE /users/:id`). It delegates to the user service and selects the correct audit action, differentiating soft delete from a permanent (GDPR Art. 17) hard delete.

## Key elements

- **`deleteUsers`** (exported const) — the controller object produced by `createDeleteController`. Configures:
  - `remove(id, hardDelete)` → calls `userService.removeById(id, hardDelete)`
  - `auditAction(hardDelete)` → returns `ADMIN_USER_ERASED` (hard) or `ADMIN_USER_SOFT_DELETED` (soft)
  - `entity: 'user'`, `notFoundKey: 'users.not-found'`

## Relationships

- **`src/infrastructure/surfaces/create-delete-controller.ts`** — provides the `createDeleteController` factory that assembles the request-validation, service-call, and audit-logging plumbing.
- **`src/modules/users/service.ts`** — `userService.removeById(id, hardDelete)` performs the actual deletion; the `hardDelete` flag controls permanence and cascading (cart, wishlist, address book) plus a `USER_DELETED` announcement.
- **`src/modules/users/audit.ts`** — supplies `usersAuditActions.ADMIN_USER_ERASED` / `.ADMIN_USER_SOFT_DELETED`, the action names written to the audit trail.
- **`src/modules/users/routes.ts`** — consumer; mounts `deleteUsers` on the relevant DELETE routes.

## Notes

- Two input shapes coexist: id in the **request body** (`DELETE /users`) or in the **path** (`DELETE /users/:id`). The controller factory handles both transparently.
- `?hardDelete=true` is the **only** signal that discharges an Art. 17 erasure obligation; a soft delete does not. The audit record itself is the durable proof of which path was taken.
- The `USER_DELETED` event (announced on hard delete) triggers cascading removal in cart, wishlist, and address-book modules—those cleanups are **not** visible in this file.
