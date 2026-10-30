---
source: src/modules/users/controllers/create-user.ts
sha256: 5e8e5b70e0489f4b526a2a08f8b4e9050b09f37bbfb3fbb69fe98d597e1a3258
generated_at: 2026-10-29T06:11:14.999036+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/controllers/create-user.ts

## Purpose

HTTP handler for `POST /users` (staff create). Validates the incoming body against a strict Zod schema, resolves an optional image upload, delegates persistence to `userService.create`, and serialises the result through `userService.toUserContract` before sending a `201` response. It exists to keep the controller thin: all business logic lives in the service, all HTTP plumbing in `@infrastructure/http/*`.

## Key elements

- **`createUser`** — the sole export; Express handler for `POST /users`.
  - Calls `parseBody(CreateUserBody, …)` to validate the body; on failure a `422` is already sent and the function returns early.
  - Calls `readInput(request, { surface: 'create', booleans: ['active'] })` to normalise multipart string booleans before validation.
  - Passes the validated body plus an optional upload image to `writeWithUploadedImage`, which invokes `userService.create({ …body, …image }, callerContextOf(request))`.
  - On success, fetches the public contract via `userService.toUserContract(result.data, caller)` and responds with `createdResponse` (201 + `Location` header).
  - On database failure, delegates to `rejectDatabaseError`.

## Relationships

- **`src/modules/users/routes.ts`** — registers `createUser` as the handler for `POST /users`.
- **`src/modules/users/services/index.ts`** — provides `userService` (`create`, `toUserContract`).
- **`src/infrastructure/http/controller.ts`** — provides `parseBody` (Zod validation + 422 short-circuit).
- **`src/infrastructure/http/request.ts`** — provides `readInput` (multipart/boolean normalisation) and `callerContextOf` (extracts caller identity for audit/service context).
- **`src/infrastructure/http/response.ts`** — provides `createdResponse` and `rejectResponse`.
- **`src/infrastructure/http/errors.ts`** — provides `rejectDatabaseError` for uniform DB-failure responses.
- **`src/infrastructure/http/uploads.ts`** — provides `writeWithUploadedImage` (handles the file part, claims the upload on success, deletes it on the close hook if the request is rejected).
- **`src/types/index.ts`** — supplies the `CreateUserRequest`, `CreateUserRequestMultipart`, and `User` type aliases used in the handler signature.

## Notes

- **Security invariant:** the Zod schema (`CreateUserBody`) is the *only* gate. Because `userService.create` writes exactly what it receives, an undeclared key (e.g. `verifiedAt`, `analyticsConsent`, a plaintext `phone`) would land directly on the document if the raw body bypassed validation. Always route through `parseBody`.
- **Express 5 quirk:** `request.body` is `undefined` when no body parser matched the content-type, and multer does not populate it for non-multipart requests. The handler signature includes `| undefined` to reflect this.
- **Multipart booleans:** `active` arrives as the string `"true"`/`"false"` in multipart requests; `readInput` decodes it. Do not assume it is a real boolean before `parseBody` runs.
- **Upload lifecycle:** if `parseBody` rejects (422), the upload file is cleaned up by the close hook — the handler does not delete it explicitly. On the success path `writeWithUploadedImage` claims (persists) the upload.
- **Role source:** the `role` in the response contract is read fresh from the membership record just written, *not* from the user document (which does not store role). Do not refactor to read it off the document.
- **Sensitive fields:** `toUserContract` selects only public `User` contract fields, so the hashed password and any tokens never reach `res.json`.
