---
source: src/modules/users/controllers/write-users.ts
sha256: 87147eb9119f0eadf7583e7fdf6ef3b077bf1196510d7ccc1213ed7a40aa17f4
generated_at: 2026-09-23T19:32:25.724223+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/controllers/write-users.ts

## Purpose

Single controller handler for `POST /users`, `PUT /users`, and `PUT /users/:id`. It reads the request body (JSON or multipart), validates it, and dispatches to `userService.create` or `userService.updateById` depending on whether an `id` is present. The file exists to isolate all HTTP-layer concerns (input parsing, upload cleanup, response shaping) from the domain logic in the service.

## Key elements

- **`writeUsers`** (exported const) — The sole handler. Accepts a loosely-typed `Request` body (six request-shape variants plus `undefined`) and a `Response`. Responsibilities:
    - Extracts `id`, `active`, `sendSetupEmail` via `readInput`; pulls `role` directly from `request.body ?? {}`.
    - Reads image upload state (`imageUrl`, `thumbnailUrl`, `pendingImageKey`, `deleteUpload`) via `readUploadedImage`.
    - Calls `userService.validateData` (zod schema, `passwordRequired: false`); on failure responds **422** and runs `deleteUpload()`.
    - **Create branch (`!id`):** rejects `PUT` without id (422), enforces "password OR sendSetupEmail" on creates, then calls `userService.create` with the caller context.
    - **Update branch (`id` present):** calls `userService.updateById`.
    - Both branches: on success maps the stored document through `userService.toUserContract` before responding; on failure or DB error runs `deleteUpload()` and responds via `rejectResponse` / `rejectDatabaseError`.

## Relationships

- **`src/modules/users/service.ts`** — Provides `userService` (`.validateData`, `.create`, `.updateById`, `.toUserContract`). The controller is a thin HTTP adapter over this service.
- **`src/modules/users/routes.ts`** — Registers `writeUsers` as the handler for the three routes.
- **`src/infrastructure/http/request.ts`** — `readInput` (field extraction with surface/ids/booleans) and `callerContextOf` (auth context for the service call).
- **`src/infrastructure/http/response.ts`** — `successResponse` and `rejectResponse` shape the HTTP reply.
- **`src/infrastructure/http/errors.ts`** — `rejectDatabaseError` maps unexpected DB exceptions to a structured 500.
- **`src/infrastructure/http/uploads.ts`** — `readUploadedImage` unpacks the multer/upload result and returns a `deleteUpload` cleanup closure.
- **`src/infrastructure/i18n/index.ts` / `context.ts`** — `t()` localizes the two static error messages (`generic.error-missing-data`, `users.field-password-or-setup-required`).
- **`src/types/index.ts`** — Request/response type aliases (`CreateUserRequest`, `UpdateUserRequest`, `User`, etc.) used in the handler's type annotation and the success-response generic.

## Notes

- **Express 5 `request.body` can be `undefined`** when no parser matched the content-type or when multer left a non-multipart body unfilled. The handler guards with `request.body ?? {}` before destructuring `role` and `password`. The type signature explicitly includes `| undefined` for this reason.
- **Upload cleanup is fire-and-forget.** Every failure/early-return path calls `deleteUpload().catch(() => undefined)` so a storage-backend hiccup degrades a 422 into a 500 and an orphaned file. The catch is intentional: the response has already been sent (or is about to be), and an unhandled rejection would be worse.
- **Create-vs-update is decided by presence of `id`**, not by HTTP method. `PUT` without an id is explicitly rejected with 422.
- **`passwordRequired` is always `false`** at the schema layer; the "password OR sendSetupEmail" constraint is enforced manually in the create branch because the zod schema cannot express that either/or.
- **`toUserContract`** filters the stored document to the public `User` shape, preventing hashed passwords and tokens from leaking into the JSON response.
- The create call spreads `request.body` typed as `Parameters<typeof userService.create>[0]` rather than naming a model type, so the controller stays coupled to the service's own contract rather than the DB schema.
