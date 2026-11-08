---
source: src/infrastructure/http/uploads.ts
sha256: 78ede6ff8624bbfeec32648c9b882f6c9d47170a0591bb56a99f23117b62570c
generated_at: 2026-11-08T03:35:13.310400+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/uploads.ts

## Purpose

Read-side helpers for uploaded images. It normalizes what the multer upload middleware left on the Express request into a uniform `RequestImage` shape that write controllers can persist, and bundles the "undo" (delete the upload on error) alongside the data. The write side (naming, file placement, quarantine) lives in the upload middleware; this file only interprets the result.

## Key elements

- **`getFormFiles(request)`** — Returns the single uploaded file's path as `string[]` or `undefined`. Exists for the simple case where a caller only needs the raw path.
- **`RequestImage`** (interface) — The four-tuple a write controller needs: `imageUrl`, `thumbnailUrl`, `pendingImageKey`, and a `deleteUpload()` undo callback. Distinguishes inline-digested, broker-pending, and "remove" states.
- **`readUploadedImage(request)`** — Reads `storedImageUrls`, `quarantinedImageKeys`, and the body's `imageUrl` off the request, returning a fully-resolved `RequestImage`. Precedence: inline upload > pending upload > body `null` (remove) > `undefined` (no change).
- **`claimUpload(request)`** — Sets `request.uploadClaimed = true` so the middleware's close-hook (`releaseUnclaimedUpload`) skips deletion. Must be called after the row naming the image is saved.
- **`ImageChanges`** (type) — `Pick<RequestImage, 'imageUrl' | 'thumbnailUrl' | 'pendingImageKey'>`; the subset a service write actually persists.
- **`writeWithUploadedImage(request, changedImageUrl, write)`** — Composes read → write → claim in one call. Passes `changedImageUrl` through only when no file was uploaded; claims the upload only on `result.success === true`.

## Relationships

- **`@infrastructure/http/middlewares/upload`** — Produces the request properties (`storedImageUrls`, `quarantinedImageKeys`, `storedThumbnailUrls`, `uploadClaimed`) that this file reads. This file never touches multer's raw `request.file` except via `getFormFiles`.
- **`@infrastructure/adapters/image-store`** — The `deleteUpload` callback delegates to `imageStore.remove()` (inline) or `imageStore.removeQuarantined()` (pending) for error-path cleanup.
- **`@infrastructure/http/config`** — Supplies `uploadConfig().NODE_PENDING_IMAGE_URL` / `NODE_PENDING_THUMBNAIL_URL` as the placeholder URLs returned when a broker will digest later.
- **`@infrastructure/http/request`** — Uses `bodyRecordOf()` for a safe, typed read of `request.body.imageUrl` (handles Express 5's unset-body case).
- **Controllers** (`update-account`, `put-example-cover`, `post-product`, `update-product`, `post-user`, `update-user`) — All consume `writeWithUploadedImage` (or `readUploadedImage` directly) to fold the upload into their module's write.
- **`tests/unit/infrastructure/http/uploads.test.ts`** — Unit tests for the read/claim/write-composition logic.

## Notes

- **Single-image only.** Every array access uses `[0]`; endpoints in this codebase accept exactly one image per request.
- **Upload beats body `null`.** If a caller sends bytes *and* `imageUrl: null`, the upload wins. The body `null` is honoured only when no file was uploaded.
- **Body `imageUrl` strings are dropped.** Only the literal `null` (remove) is propagated; any string the client sends is treated as `undefined` (no change). This prevents a client from naming another record's file for deletion.
- **`deleteUpload` is best-effort.** It never rejects and returns `Promise<boolean>`; it exists solely for error paths (4xx/5xx) to clean up the upload this request created.
- **Claim-or-delete contract.** If a controller never calls `claimUpload` (or `writeWithUploadedImage` doesn't see `success: true`), the middleware's close hook deletes the upload file. Forgetting to claim on a new success path silently leaks no files but loses the image.
- **Express 5 quirk.** `request.body` is left unset when no body parser matched the content-type; `bodyRecordOf` handles this so the shared guard covers all image-accepting controllers at once.
