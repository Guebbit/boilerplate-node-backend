# src/modules/users/controllers/delete-users.ts

## Purpose

Defines the admin-facing HTTP controller for deleting users. It wires the two `DELETE /users` endpoints (id in body or in path) to the user service via a shared delete-controller factory, and attaches audit logging for every deletion.

## Key elements

- **`deleteUsers`** (exported const) — the controller instance produced by `createDeleteController`. Configured with:
  - `entity: 'user'` — label used by the factory for routing/semantics.
  - `remove(id, hardDelete)` — delegates to `userService.removeById(id, hardDelete)`.
  - `auditAction: usersAuditActions.ADMIN_USER_DELETED` — the audit event recorded on each call.
  - `notFoundKey: 'users.not-found'` — i18n key returned when no user matches the id.

## Relationships

- **`src/infrastructure/http/delete-controller.ts`** — Supplies the `createDeleteController` factory. This file passes its config object in; the factory handles the two route signatures (body-id vs. path-id), the `?hardDelete` query param parsing, and the standard 404/500 responses.
- **`src/modules/users/service.ts`** — Provides `userService.removeById`, which performs the actual (soft or hard) deletion.
- **`src/modules/users/audit.ts`** — Provides the `usersAuditActions.ADMIN_USER_DELETED` enum/constant used as the audit action.
- **`src/modules/users/routes.ts`** — Registers `deleteUsers` on the users router so it is reachable at the `/users` paths.

## Notes

- Hard delete (via `?hardDelete=true`) announces a `USER_DELETED` domain event, which is the mechanism that cascades deletion of the account's cart, wishlist, and address book. Soft delete does **not** trigger that cascade.
- Both route variants are admin-only; the authorization check is presumably handled by the `createDeleteController` factory or a route-level guard in `routes.ts`.
- The controller is a thin composition—no business logic lives here. All domain behavior is in `service.ts`; all route mechanics are in the infrastructure factory.
