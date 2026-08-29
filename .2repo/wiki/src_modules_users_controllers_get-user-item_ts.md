# src/modules/users/controllers/get-user-item.ts

## Purpose

Express route handler for `GET /users/:id` (admin endpoint). Resolves a single user by its path parameter ID, returning the user object on success or a 404 with a localized message when the user doesn't exist or the ID isn't a valid ObjectId.

## Key elements

- **`getUserItem`** (exported) — The sole handler. Calls `userService.getById()`, then:
  - `200` + user object via `successResponse` if found.
  - `404` + `[t('users.not-found')]` via `rejectResponse` if `null` or the Mongoose `CastError` kind is `ObjectId`.
  - Falls through to `rejectDatabaseError` for any other error.

## Relationships

- **`src/modules/users/service.ts`** — Calls `userService.getById(id)` to perform the actual lookup.
- **`src/modules/users/routes.ts`** — Registers `getUserItem` as the handler for the `GET /users/:id` route.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse` / `rejectResponse` for uniform response shaping.
- **`src/infrastructure/http/errors.ts`** — Provides `rejectDatabaseError` for unexpected DB failures.
- **`src/infrastructure/i18n/index.ts` / `context.ts`** — Supplies the `t()` function for the localized `"users.not-found"` message.

## Notes

- Uses a `.then()/.catch()` promise chain rather than `async/await`; the `.catch` callback casts the argument to Mongoose's `CastError`.
- An invalid (non-hex) ObjectId is deliberately mapped to **404** (not-found) instead of **400**, so clients can't distinguish "bad syntax" from "genuinely missing."
- The file is intentionally small — all business logic lives in `userService.getById`; the controller only handles transport concerns (status codes, error mapping, i18n).
