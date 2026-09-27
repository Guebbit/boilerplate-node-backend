---
source: src/modules/users/controllers/create-user.ts
sha256: 23a3fc26b64ddc373a0d23b29b4d93eb1c534aae2974ef8d72385bcc7857b64a
generated_at: 2026-09-27T15:36:08.298574+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/controllers/create-user.ts

## Purpose

Handles the `POST /users` endpoint (staff-initiated user creation). It parses the incoming request (JSON or multipart), validates the payload via the users service, delegates persistence to `userService.create`, and shapes the HTTP response. The update half of this controller pair lives in `update-user.ts`.

## Key elements

- **`createUser(request, response)`** (exported) — The sole handler. Parses `active`/`sendSetupEmail` booleans via `readInput`, extracts `role` from the body, pulls image fields via `readUploadedImage`, runs `userService.validateData` (password not required at this layer), then calls `userService.create` with the merged payload and `callerContextOf(request)`. Returns 201 with the user contract on success; 422 with field errors or the service's own status/errors on failure.
- **`deleteUpload()`** (from `readUploadedImage`) — Fire-and-forget cleanup of any uploaded image when the request fails validation or the service rejects. Never blocks the response; errors are swallowed (`.catch(() => undefined)`).
- **`toUserContract`** (called on `userService`) — Projects the stored document down to the public `User` contract, stripping hashed passwords and internal tokens before the 201 response.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/users/service.ts` | Imports `userService`; calls `validateData`, `create`, and `toUserContract`. |
| `src/modules/users/routes.ts` | Registers `createUser` as the handler for `POST /users`. |
| `src/infrastructure/http/request.ts` | Imports `readInput` (boolean coercion for multipart) and `callerContextOf`. |
| `src/infrastructure/http/response.ts` | Imports `successResponse` and `rejectResponse` for 201 / 4xx replies. |
| `src/infrastructure/http/errors.ts` | Imports `rejectDatabaseError` for the catch-all DB failure path. |
| `src/infrastructure/http/uploads.ts` | Imports `readUploadedImage` to extract image URLs and the `deleteUpload` cleanup function. |
| `src/types/index.ts` | Imports `CreateUserRequest`, `CreateUserRequestMultipart`, and `User` types. |

## Notes

- **`request.body` may be `undefined`.** Express 5 leaves it unset when no body parser matched the content-type, and multer does not populate it on non-multipart requests. The handler guards with `request.body ?? {}` when reading `role`.
- **`imageUrl` is intentionally left as `undefined` (not defaulted to `''`).** An empty string would fail `ImageUrl`'s `minLength: 1` in the validator, whereas `undefined` is treated as "absent" by the optional field.
- **Password enforcement is not in this controller.** `validateData` is called with `false` for the password-required flag because `sendSetupEmail` is a valid alternative; the either/or is enforced inside `userService.create`.
- **`pendingImageKey` is server-derived**, not client-supplied, and is not part of the `User` contract — it is intersected in separately and never serialized in the response.
- **`role` is read from the raw body**, not via `readInput`, because it is a plain string on every content-type surface and needs no coercion.
