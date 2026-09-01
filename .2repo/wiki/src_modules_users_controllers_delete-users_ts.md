# src/modules/users/controllers/delete-users.ts

## Purpose

Single-purpose controller module that wires up the `DELETE /users` and `DELETE /users/:id` admin endpoints (soft delete by default, hard delete via `?hardDelete=true`). It delegates all business logic to the user service and exists so that route definitions and audit policy stay decoupled from the controller shape.

## Key elements

- **`deleteUsers`** (exported const) — The only export. Built by calling `createDeleteController` with:
  - `entity: 'user'`
  - `remove(id, hardDelete)` — calls `userService.removeById(id, hardDelete)`
  - `auditAction` — set to `usersAuditActions.ADMIN_USER_DELETED`
  - `notFoundKey: 'users.not-found'` — i18n key returned when the id does not resolve to a record

## Relationships

- **`create-delete-controller.ts`** — Provides the generic factory (`createDeleteController`) that produces the request handler. This file is a thin configuration over that factory.
- **`service.ts`** — Supplies `userService.removeById`, the actual persistence call (soft or hard).
- **`audit.ts`** — Supplies `usersAuditActions.ADMIN_USER_DELETED`, the audit-log action key recorded after a successful delete.
- **`routes.ts`** — Imports and mounts `deleteUsers` on the `DELETE /users` and `DELETE /users/:id` paths.

## Notes

- Hard delete (`?hardDelete=true`) triggers a `USER_DELETED` domain event that cascades to cart, wishlist, and address book (per the docblock). The cascade logic itself lives downstream of the service, not in this file.
- The controller accepts the user id either from the **request body** (`DELETE /users`) or the **path param** (`DELETE /users/:id`); the `createDeleteController` factory abstracts that duality.
- The module is annotated `@module` and has no default export—import `{ deleteUsers }` by name.
