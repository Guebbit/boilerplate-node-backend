---
source: src/infrastructure/http/uploads.ts
sha256: 78ede6ff8624bbfeec32648c9b882f6c9d47170a0591bb56a99f23117b62570c
generated_at: 2026-10-29T02:06:07.487841+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/uploads.ts

## Purpose

Read-side helpers for file uploads. Given a request that has already passed through the multer upload middleware, this module normalises the stored URLs, quarantined keys, and body fields into a uniform `RequestImage` object, and provides a claim/release lifecycle so that unclaimed uploads are cleaned up automatically on error responses.

## Key elements

- **`getFormFiles(request)`** — Extracts the uploaded file's path from `request.file` (the only shape used, since the codebase always mounts `multer.single()`). Returns `string[] | undefined` for a uniform shape.
- **`RequestImage`** — Interface a write controller consumes: `imageUrl` (final URL, pending placeholder, `null` for remove, or `undefined` for no change), `thumbnailUrl`, `pendingImageKey` (for later digest writeback), and `deleteUpload()` (scoped cleanup of this request's own upload).
- **`readUploadedImage(request)`** — Core reader. Checks `storedImageUrls[0]` (inline digest) → `quarantinedImageKeys[0]` (pending digest) → body `imageUrl` (only literal `null` honoured). Returns a fully populated `RequestImage`.
- **`claimUpload(request)`** — Sets `request.uploadClaimed = true` so the middleware's close hook (`releaseUnclaimedUpload`) skips deletion.
- **`ImageChanges`** — `Pick<RequestImage, 'imageUrl' | 'thumbnailUrl' | 'pendingImageKey'>`; the persistable subset without the undo function.
- **`writeWithUploadedImage(request, changedImageUrl, write)`** — Orchestrator: reads the upload, folds it into the write call (upload wins over `changedImageUrl`), then claims the upload only if `write` resolves with `success: true`.

## Relationships

- **`src/infrastructure/http/middlewares/upload.ts`** — The write side this file reads from. The middleware populates `storedImageUrls`, `storedThumbnailUrls`, `quarantinedImageKeys`, and later checks `uploadClaimed`. This file never writes to those fields except `uploadClaimed` via `claimUpload`.
- **`src/infrastructure/adapters/image-store.ts`** — Imported as `imageStore`; used inside the `deleteUpload` closures (`imageStore.remove`, `imageStore.removeQuarantined`).
- **`src/infrastructure/http/config.ts`** — Imported as `uploadConfig`; supplies `NODE_PENDING_IMAGE_URL` and `NODE_PENDING_THUMBNAIL_URL` placeholders.
- **`src/infrastructure/http/request.ts`** — Imported as `bodyRecordOf`; safe accessor for `request.body` (guards Express 5's unset-body case).
- **Controllers** (`update-account`, `put-example-cover`, `create-product`, `update-product`, `create-user`, `update-user`) and **`src/modules/example/services/cover.ts`** — All consume `readUploadedImage`, `writeWithUploadedImage`, and `ImageChanges` as the standard way to handle image fields in a write.
- **`tests/unit/infrastructure/http/uploads.test.ts`** — Unit tests for this module.

## Notes

- **Upload always beats body `null`.** If a request carries both an uploaded file and `body.imageUrl === null`, the upload wins. A byte upload is treated as a stronger intent signal.
- **Body `imageUrl` only honours literal `null`.** Any string value from the body is silently dropped to `undefined` — a client-named path could otherwise cause one record to delete another's file.
- **`deleteUpload` is strictly request-scoped.** It only removes files *this* request created (quarantine or promoted). It never touches files named in the body.
- **Single-image assumption.** All array reads use index `[0]`; extra files (if multer ever received more) are ignored.
- **Express 5 quirk.** `request.body` is left unset when no body parser matched the content-type; `bodyRecordOf` in `request.ts` handles this, and the "no body" guard in `readUploadedImage` covers all image-accepting controllers at once.
