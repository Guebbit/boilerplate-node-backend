---
source: src/modules/users/controllers/post-user.ts
sha256: 5e8e5b70e0489f4b526a2a08f8b4e9050b09f37bbfb3fbb69fe98d597e1a3258
generated_at: 2026-11-08T08:44:50.235136+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/controllers/post-user.ts

## Purpose

Controller for the `POST /users` endpoint (staff user creation). Validates the incoming body against a strict Zod schema, decodes multipart booleans, handles an optional image upload, delegates the write to `userService.create`, and returns a `201` with a sanitized user contract. The complementary `PUT` half lives in `update-user.ts`.

## Key elements

- **`createUser`** (exported) — The sole handler. Accepts an Express `Request` whose body may be `CreateUserRequest`, `CreateUserRequestMultipart`, or `undefined` (Express 5 / multer edge-case). Performs the full request→validate→write→respond pipeline.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Provides `parseBody`, which validates the decoded input against the `CreateUserBody` Zod schema and short-circuits with `422` on failure.
- **`src/infrastructure/http/request.ts`** — Provides `readInput` (decodes string-encoded booleans from multipart bodies) and `callerContextOf` (extracts the authenticated caller for the service call).
- **`src/infrastructure/http/response.ts`** — Provides `createdResponse` (201 + `Location` header) and `rejectResponse` (generic error envelope).
- **`src/infrastructure/http/errors.ts`** — Provides `rejectDatabaseError`, the catch-all for unexpected write failures.
- **`src/infrastructure/http/uploads.ts`** — Provides `writeWithUploadedImage`, which wires the optional image upload to the write callback and claims/deletes the temp file based on outcome.
- **`src/modules/users/services/index.ts`** — Exposes `userService`; this file calls `.create` and `.toUserContract` on it.
- **`src/modules/users/routes.ts`** — Registers `createUser` as the handler for `POST /users`.
- **`src/types/index.ts`** — Supplies the `CreateUserRequest`, `CreateUserRequestMultipart`, and `User` type aliases used in the signature and response generic.

## Notes

- **Strict schema is non-negotiable here.** `parseBody` rejects any undeclared key with `422`. Because `userService.create` writes its argument verbatim, skipping validation would let an operator set `verifiedAt`, `analyticsConsent`, or an unencrypted `phone` directly on the document.
- **Multipart booleans arrive as strings.** `readInput` is called with `{ booleans: ['active'] }` to decode them before schema validation (see `docs/theory/request-input.md`).
- **Image fields are server-decided.** They are merged *after* body validation (as `null`-only for `imageUrl`) so the Zod schema never sees them. `writeWithUploadedImage` claims the temp upload only on a successful write; the response close hook deletes it on a `422` rejection.
- **Response sanitisation.** `toUserContract` selects only the public `User` contract fields, guaranteeing the hashed password and tokens never appear in `res.json`. The `role` is read fresh from the newly-written membership record, not from the document (which stores none).
- **`request.body` can be `undefined`.** Express 5 leaves it unset when no body parser matches the content-type, and multer does not populate it for non-multipart requests. The signature explicitly includes `| undefined` to reflect this.
