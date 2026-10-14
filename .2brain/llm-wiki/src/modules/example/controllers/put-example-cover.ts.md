---
source: src/modules/example/controllers/put-example-cover.ts
sha256: 4fb46b6f6c30668ce9e658b39c52d6402a02d1b07da470d37485bdeb3fe927ea
generated_at: 2026-10-14T15:41:16.757443+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/controllers/put-example-cover.ts

## Purpose

Controller handler for `PUT /examples/:id/cover`. Reads the already-processed image upload from the request (performed by middleware in `routes.ts`) and delegates to `exampleService.setCover` to persist the new cover and thumbnail URLs for the given example.

## Key elements

- **`putExampleCover`** — Exported Express handler, wrapped in `namedHandler('putExampleCover', …)`. Validates the `:id` param, reads the uploaded image fields (`imageUrl`, `thumbnailUrl`, `pendingImageKey`) off the request, rejects with 422 if no image is present, then calls `exampleService.setCover`. On success it claims the upload and returns 200; on refusal or error it responds via the standard `refused` / `catchAs` helpers.

## Relationships

- **`routes.ts`** — Mounts the upload middleware *before* this handler; the middleware populates the request with the parsed image data that `readUploadedImage` consumes.
- **`uploads.ts`** — Supplies `readUploadedImage` (extracts URLs + storage key from the request) and `claimUpload` (marks the upload as consumed so the middleware's close-hook won't delete it).
- **`controller.ts`** — Provides `namedHandler` (wrapping), `refused` (distinguishes business-level rejections from errors), and `catchAs` (uniform error response).
- **`ids.ts`** — `requireId` validates and extracts the `:id` route param, returning `null` + a 404 if absent.
- **`request.ts`** — `callerContextOf` pulls authentication/actor context to pass into the service call.
- **`response.ts`** — `successResponse` / `rejectResponse` build the JSON envelopes returned to the client.
- **`i18n/index.ts` / `i18n/context.ts`** — `t(…)` resolves user-facing error messages (e.g. `example.cover-missing`, `example.not-found`) in the caller's locale.
- **`services/index.ts`** — `exampleService.setCover` performs the actual persistence; this controller only orchestrates request/response.

## Notes

- **Cannot clear a cover here.** Sending `imageUrl: null` in the body without an upload file is rejected with 422; clearing a cover is intentionally a different endpoint.
- **Upload lifecycle is handled by the middleware.** If the handler responds 4xx/5xx the middleware's close-hook deletes the unclaimed upload. Only a successful 200 path calls `claimUpload`; no manual cleanup code is needed in this file.
- The `pendingImageKey` is passed through to the service unchanged — the service is responsible for any async storage promotion or validation.
