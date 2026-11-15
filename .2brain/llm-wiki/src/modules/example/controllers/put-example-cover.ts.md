---
source: src/modules/example/controllers/put-example-cover.ts
sha256: fe094b5646770003c52b6a2c782f1793416229ce9cdd54c87ee751dca90762b9
generated_at: 2026-11-14T19:57:51.509538+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/controllers/put-example-cover.ts

## Purpose

Express handler for `PUT /examples/:id/cover`. Reads the uploaded image (left on the request by the upload middleware) and delegates the cover replacement to the module's service. Exists as the thin controller layer between the HTTP contract and the business logic.

## Key elements

- **`putExampleCover`** (exported) — the only export. Wrapped in `namedHandler('putExampleCover', …)` for structured logging. Steps:
  1. `requireId` validates the `:id` path param (404 on failure).
  2. `readUploadedImage(request)` extracts `imageUrl`, `thumbnailUrl`, `pendingImageKey` from the middleware's request attachment.
  3. Rejects with **422** (`example.cover-missing`) if no actual image file was uploaded.
  4. Calls `exampleService.setCover(id, {…}, callerContextOf(request))`.
  5. On success: `claimUpload(request)` then `successResponse` (200). On refusal/error: `refused` / `catchAs` short-circuit.

## Relationships

- **`src/infrastructure/http/controller.ts`** — supplies `namedHandler`, `refused`, `catchAs` (error/short-circuit plumbing).
- **`src/infrastructure/http/ids.ts`** — `requireId` validates the route param against the Express request.
- **`src/infrastructure/http/request.ts`** — `callerContextOf` extracts auth/caller metadata for the service call.
- **`src/infrastructure/http/response.ts`** — `successResponse` / `rejectResponse` shape the JSON reply.
- **`src/infrastructure/http/uploads.ts`** — `readUploadedImage` reads the file metadata the upload middleware stored on `req`; `claimUpload` marks the upload as consumed so the close-hook won't delete it.
- **`src/infrastructure/i18n/index.ts`** — `t()` localises the 422 error message.
- **`src/infrastructure/i18n/context.ts`** — provides the i18n request context that `t` reads from.

## Notes

- **No `If-Match` / ETag.** The route is a whole-file replace; there is no prior GET on this URL to establish a baseline, so optimistic concurrency is intentionally absent.
- **Upload cleanup is middleware-driven.** The upload middleware's `close` hook deletes the temp file whenever the response is 4xx/5xx. The controller only calls `claimUpload` on the success path; every error/refuse branch relies on the hook. Forgetting to call `claimUpload` on success would orphan-delete a valid upload.
- **`imageUrl: null` does not clear a cover.** Only a real uploaded file passes validation; a body-only null is rejected with 422.
- The file is explicitly a template: the doc comment says to delete it (along with `services/cover.ts`, the route, and the contract path) if the module has no cover upload.
