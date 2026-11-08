---
source: src/modules/example/controllers/put-example-cover.ts
sha256: e2db3a390449db6fe4bbf31f2b5704724e11ac9eff4f9030cebc9f85ecadbfa6
generated_at: 2026-11-08T05:49:17.373396+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/controllers/put-example-cover.ts

## Purpose

Upload controller for `PUT /examples/:id/cover`. It reads the uploaded image data left on the request by upload middleware, validates that an image is actually present, and delegates to `exampleService.setCover` to persist the new cover. Exists as the thin HTTP→service bridge for the example module's cover-replacement endpoint.

## Key elements

- **`putExampleCover`** (exported) — The sole handler, wrapped in `namedHandler('putExampleCover', …)`. Sequence:
  1. Extracts and validates `:id` via `requireId` (404 on missing).
  2. Calls `readUploadedImage(request)` to pull `imageUrl`, `thumbnailUrl`, `pendingImageKey`.
  3. Rejects with **422** if `imageUrl` is not a string (no file uploaded).
  4. Calls `exampleService.setCover(id, { imageUrl, thumbnailUrl, pendingImageKey }, callerContextOf(request))`.
  5. On a refused result, bails early (upload auto-cleaned). Otherwise calls `claimUpload(request)` then responds **200** with `result.data`.
  6. Catches thrown errors via `catchAs(response, 'putExampleCover')`.

## Relationships

- **`@infrastructure/http/controller.ts`** — Supplies `namedHandler`, `catchAs`, and `refused` (the standard handler-wrapping / error-capture / service-refusal helpers).
- **`@infrastructure/http/ids.ts`** — `requireId` pulls the `:id` route param and short-circuits with a 404.
- **`@infrastructure/http/request.ts`** — `callerContextOf(request)` extracts the authenticated caller's context to pass to the service.
- **`@infrastructure/http/response.ts`** — `successResponse` / `rejectResponse` build the JSON envelopes.
- **`@infrastructure/http/uploads.ts`** — `readUploadedImage` reads the file data the upload middleware attached; `claimUpload` marks the upload as consumed so the close-hook won't delete it.
- **`@infrastructure/i18n/index.ts`** — `t` provides the `example.cover-missing` translation string used in the 422 body.
- **`src/modules/example/routes.ts`** — Registers `putExampleCover` on the `PUT /examples/:id/cover` route (and presumably the upload middleware that populates the request before this handler runs).
- **`src/modules/example/services/index.ts`** — `exampleService.setCover` is the domain operation this handler delegates to.

## Notes

- **Upload lifecycle is request-scoped.** The upload middleware registers a close hook that deletes the stored file if the request ends 4xx/5xx. The only way to *keep* the upload is to call `claimUpload(request)` after a successful write. Because `refused` short-circuits before `claimUpload`, a service-level refusal still triggers automatic cleanup—no manual deletion needed in any branch.
- **Not a clear-cover endpoint.** Sending `imageUrl: null` in the body without a file upload is rejected with 422 (`example.cover-missing`). Clearing a cover must go through a different route/contract.
- **Module-level doc comment** instructs deletion of this file *together with* `services/cover.ts`, the route entry, and the contract path if the example module ever drops upload support.
