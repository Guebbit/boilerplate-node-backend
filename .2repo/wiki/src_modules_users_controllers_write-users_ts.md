# src/modules/users/controllers/write-users.ts

## Purpose

Single Express handler that serves both user creation (`POST /users`) and user updates (`PUT /users`, `PUT /users/:id`). The create-vs-update branch is decided at runtime by the presence of an `id` (in the path or body), so one function covers all three routes. It validates input, manages uploaded-image lifecycle, and delegates persistence to `userService`.

## Key elements

- **`writeUsers`** (exported const) — The sole export. An async-style (Promise-returning) Express handler that:
  - Reads scalar fields via `readInput` (with explicit `ids` and `booleans` lists for multipart correctness).
  - Reads an optional image upload via `readUploadedImage`, which also yields a `deleteUpload` cleanup callback.
  - Validates the body with `userService.validateData` (password-optional flag set to `false`; the password-or-setup-email rule is enforced separately).
  - **Create branch** (`!id`): rejects `PUT` without an id (422), enforces that a password *or* `sendSetupEmail` is present, then calls `userService.create` and responds 201.
  - **Update branch** (`id` present): calls `userService.updateById` and responds with the service's status/errors or data.
  - On every failure path (validation error, missing id on PUT, missing password, DB error) it invokes `deleteUpload()` before sending the response, preventing orphaned storage files.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/users/service.ts` | Calls `userService.validateData`, `userService.create`, and `userService.updateById` for all business logic. |
| `src/modules/users/routes.ts` | Wires `writeUsers` to the `POST /users`, `PUT /users`, and `PUT /users/:id` routes. |
| `src/infrastructure/http/request.ts` | Imports `readInput` (field extraction with multipart boolean handling) and `callerContextOf` (caller identity for audit/service calls). |
| `src/infrastructure/http/response.ts` | Imports `successResponse` and `rejectResponse` for uniform JSON responses. |
| `src/infrastructure/http/errors.ts` | Imports `rejectDatabaseError` to map unexpected service errors to an appropriate HTTP response. |
| `src/infrastructure/adapters/image-store.ts` | Imports `readUploadedImage` to parse the multipart image and obtain the `deleteUpload` rollback handle. |
| `src/infrastructure/i18n/index.ts` | Imports `t` for localised error messages (e.g. missing-id, password-required). |
| `src/infrastructure/i18n/context.ts` | Provides the i18n context that `t` reads (locale, catalogue); consumed transitively. |
| `src/types/index.ts` | Supplies the request-body union types (`CreateUserRequest`, `UpdateUserRequest`, etc.) and the `User` contract type. |

## Notes

- **`deleteUpload` must be called on *every* failure path.** A missed call leaves an orphaned file in storage with no DB row referencing it. The handler calls it in five distinct spots (validation failure, PUT-without-id, missing-password, create DB error, update DB error / service-level failure).
- **`booleans` in `readInput`** exists because multipart form data is always a string; the infrastructure layer coerces those fields back to `boolean` so downstream validation works. Omitting a boolean field from that list silently yields a string.
- **The `as` assertion on `validated`** is deliberate: it documents that the values have *already* passed `userService.validateData` (which runs `zodUserSchema`). It is not a bypass of validation.
- **PUT without an id is 422, not 404/405.** The route table likely still registers the handler for `PUT /users`; the handler itself enforces the "id required" rule and returns a structured 422.
- **Create response is 201** (not 200); the returned `User` object has its password field stripped by the schema's `toJSON` transform before serialization.
- The handler is **not** marked `async`; it returns Promises directly. Callers (routes) may or may not `await` it—Express 4 does not auto-handle rejected promises, so the `.catch` chains here are load-bearing.
