---
source: src/modules/users/controllers/post-user.ts
sha256: 8c52d3556b953b637eaa2f3af3af6819fc7e29e65d21732dc28dac02a5c8ac9b
generated_at: 2026-11-14T22:21:41.677484+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/controllers/post-user.ts

## Purpose

Request handler for `POST /users` (staff user creation). It validates the incoming body against a strict Zod schema, optionally processes an uploaded image, delegates to the user service, and responds with the created user as a 201 resource.

## Key elements

- **`createUser`** (exported) — The sole handler. Accepts a typed Express `Request`/`Response`, runs body parsing, upload handling, service call, and response shaping in a single promise chain.

## Relationships

- **`src/modules/users/services/index.ts`** — The handler calls the imported user service to perform the actual DB write and to project the stored document into the public contract shape.
- **`src/infrastructure/http/controller.ts`** — Imports `parseBody`, which validates the raw body against the Zod schema and short-circuits with 422 on failure.
- **`src/infrastructure/http/request.ts`** — Imports `readInput` (decodes multipart string booleans such as the `active` field) and `callerContextOf` (extracts the authenticated caller for service calls).
- **`src/infrastructure/http/uploads.ts`** — Imports `writeWithUploadedImage`; handles the optional multipart image and injects the resulting image fields into the create payload.
- **`src/infrastructure/http/response.ts`** — Imports `rejectResponse` for 4xx/5xx paths and `createdResponse` for the 201 with `Location` header.
- **`src/infrastructure/http/preconditions.ts`** — Imports `answerAsResource` to set ETag and Content-Location headers per RFC 9110.
- **`src/infrastructure/http/errors.ts`** — Imports `rejectDatabaseError` as the final catch handler for unexpected DB failures.
- **`src/infrastructure/http/schemas.ts`** — Imports `wellFormedLocale` to tighten the locale field's schema before parsing.
- **`src/types/index.ts`** — Imports `CreateUserRequest`, `CreateUserRequestMultipart`, and `User` types for the request/response signatures.
- **`src/modules/users/routes.ts`** — Consumes `createUser` as the handler bound to the `POST /users` route.

## Notes

- The request body type explicitly includes `| undefined` because Express 5 leaves `request.body` undefined when no parser matched the content-type, and multer does not populate it for non-multipart bodies.
- `parseBody` returning `null` means a 422 has already been sent; the request's close hook is responsible for deleting any in-flight upload.
- The service's contract projection picks only the public `User` fields so that hashed passwords and internal tokens on the stored document never reach `res.json`.
- The `role` in the response is read fresh from the just-written membership, not from the document (the document stores no role).
- `readInput` decodes multipart string booleans for the `active` field; see `docs/theory/request-input.md` for the broader convention.
- The update half of the user CRUD lives in a sibling file (`update-user.ts`); this file is strictly the create path.
