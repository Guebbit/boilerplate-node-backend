---
source: src/modules/users/controllers/create-user.ts
sha256: c5b91c11493e40170da111c2738d9b745fa9d3fd03ae87b0e12af5534eac9d50
generated_at: 2026-10-15T12:06:43.192103+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/controllers/create-user.ts

## Purpose

Request handler for `POST /users` (staff-initiated user creation). Validates the incoming body against a strict Zod schema, resolves server-side image-upload fields, delegates persistence to `userService`, and serialises the response. It is the "create" half of the user write surface; the counterpart lives in `update-user.ts`.

## Key elements

- **`createUser`** *(exported const)* — The sole export. An Express handler that:
  1. Extracts `imageUrl`, `thumbnailUrl`, `pendingImageKey` from the upload via `readUploadedImage`.
  2. Validates the body with `parseBody(CreateUserBody, …)` (Zod); returns a 422 on failure.
  3. Builds a `validated` object (`role`, `active`, `thumbnailUrl`, `pendingImageKey`) that is always server-derived.
  4. Calls `userService.create(…, callerContextOf(request))`.
  5. On success: claims the upload, maps the document through `userService.toUserContract`, and sends `201 Created` with a `Location` header.
  6. On service failure or unexpected throw: sends the appropriate error via `rejectResponse` / `rejectDatabaseError`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/users/routes.ts` | Registers `createUser` on the `POST /users` route. |
| `src/modules/users/services/index.ts` | Calls `userService.create(…)` and `userService.toUserContract(…)`. |
| `src/infrastructure/http/response.ts` | Imports `rejectResponse`, `createdResponse`. |
| `src/infrastructure/http/errors.ts` | Imports `rejectDatabaseError`. |
| `src/infrastructure/http/controller.ts` | Imports `parseBody` (Zod schema → validated body or 422). |
| `src/infrastructure/http/request.ts` | Imports `readInput` (body/multipart decoding, boolean coercion) and `callerContextOf` (audit context). |
| `src/infrastructure/http/uploads.ts` | Imports `claimUpload` (confirm upload after success) and `readUploadedImage` (resolve upload URLs/keys). |
| `src/types/index.ts` | Imports `CreateUserRequest`, `CreateUserRequestMultipart`, `User` as type-only dependencies. |

## Notes

- **Body type includes `| undefined`.** Express 5 leaves `request.body` undefined when no parser matched, and multer does not populate it for non-multipart requests. The union is intentional; don't "fix" it.
- **No `''` default for `imageUrl`.** `undefined` already signals "no change"; `''` would be invalid per `ImageUrl`'s `minLength: 1`.
- **Strict-schema guard.** The comment in the source explicitly warns that `userService.create` writes exactly what it receives; feeding a raw body would let an operator set `verifiedAt`, `analyticsConsent`, or an unencrypted `phone` directly on the document.
- **Upload lifecycle.** `claimUpload(request)` is called only *after* the service reports success. If `parseBody` rejects (422), the framework's close hook deletes the upload—no manual cleanup needed in this handler.
- **Response safety.** `toUserContract` selects only contract-visible fields, so hashed passwords and tokens on the stored document never appear in `res.json`. The `role` is read from the freshly-written membership record, not from the user document (which does not store it).
- **Multipart booleans.** `readInput` with `booleans: ['active']` coerces the string `"true"`/`"false"` that a multipart form sends into a real boolean before Zod sees it.
