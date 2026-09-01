# src/modules/users/controllers/get-user-item.ts

## Purpose

Defines the `GET /users/:id` endpoint controller, which retrieves a single user by its path parameter. Restricted to admin roles.

## Key elements

- **`getUserItem`** (exported const) — The route handler produced by `createItemController`. Configured with entity name `'user'`, a `notFoundKey` of `'users.not-found'` for i18n error messages, and a `fetch` callback that delegates to `userService.getById(id)`.

## Relationships

- **`src/infrastructure/surfaces/create-item-controller.ts`** — Provides the `createItemController` factory that wraps the fetch callback with standard validation, authorization (admin check), and 404 handling.
- **`src/modules/users/service.ts`** — Source of `userService.getById`, the data-access function called during request handling.
- **`src/modules/users/routes.ts`** — Imports and mounts `getUserItem` at the `GET /users/:id` route.

## Notes

- The `notFoundKey` value (`'users.not-found'`) must exist as a translation key in the i18n bundle; a typo here would surface as a raw string in the 404 response body.
- Authorization (admin-only) is enforced by `createItemController` internally, not in this file — don't add redundant guards here.
