---
source: src/infrastructure/http/uploads.ts
source_sha256: f40a384f642493758c9899b0683254319d1951a78658851b08bd12d62171bb24
context_sha256: 805fecc54ef476f55b148567340e8353d2d099fd0a0b5862226199d20f79e52d
generated_at: 2026-11-22T02:54:42.924818+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/http/uploads.ts

## Purpose
Read-side helpers for file uploads. The upload middleware (`src/infrastructure/http/middlewares/upload.ts`) decides where files land and how they are named. This module normalizes what that middleware left on the Express request, so write controllers can get the image fields to persist and clean up after a failed write.

## Key elements
- **`getFormFiles(request)`** – returns `[request.file.path]` or `undefined`. It only handles `multer.single()` (`request.file`), not `request.files`.
- **`RequestImage`** – interface describing what a write controller needs:
  - `imageUrl`: `string | null | undefined`
  - `thumbnailUrl`
  - `pendingImageKey`
  - `deleteUpload()`: removes only this request's own upload and never rejects.
- **`readUploadedImage(request)`** – builds a `RequestImage` from `storedImageUrls`, `storedThumbnailUrls`, `quarantinedImageKeys` and `body`. It takes the first of each array and resolves in this order:
  1. **Inline digest** (`storedImageUrls[0]`): uses the stored image and thumbnail URLs. `deleteUpload` removes the stored image through the image store.
  2. **Pending digest** (`quarantinedImageKeys[0]`): uses `NODE_PENDING_IMAGE_URL` and `NODE_PENDING_THUMBNAIL_URL` from `uploadConfig()`, plus the quarantine key. `deleteUpload` removes the quarantined file through the image store.
  3. **No upload**: `imageUrl` is `null` only if the body's `imageUrl` is literally `null` (remove), otherwise `undefined` (no change). `deleteUpload` resolves `false`.
- **`claimUpload(request)`** – sets `request.uploadClaimed = true`, so the middleware's close hook (`releaseUnclaimedUpload`) keeps the upload.
- **`ImageChanges`** – `RequestImage` without `deleteUpload`.
- **`writeWithUploadedImage(request, changedImageUrl, write)`** – calls `readUploadedImage`, then runs `write` with the image fields. If `result.success` is true, it calls `claimUpload`. If `imageUrl` is `undefined`, it falls back to `changedImageUrl`.

## Relationships
- **`src/infrastructure/http/middlewares/upload.ts`** – the write side. It populates `storedImageUrls`, `storedThumbnailUrls`, `quarantinedImageKeys` and `uploadClaimed`. Its close hook deletes unclaimed uploads.
- **`src/infrastructure/adapters/image-store.ts`** – its `imageStore` backs `deleteUpload` (removing promoted or quarantined files).
- **`src/infrastructure/http/config.ts`** – `uploadConfig()` supplies the pending image and thumbnail placeholder URLs.
- **`src/infrastructure/http/request.ts`** – `bodyRecordOf` safely reads the body's `imageUrl`.
- **Controllers** (`src/modules/account/controllers/update-account.ts`, `src/modules/example/controllers/put-example-cover.ts`, `src/modules/products/controllers/post-product.ts`, `src/modules/products/controllers/update-product.ts`, `src/modules/users/controllers/post-user.ts`, `src/modules/users/controllers/update-user.ts`) and **`src/modules/example/services/cover.ts`** are consumers. Based on the neighbor list, they use these helpers to read the uploaded image and claim it after a successful write.
- **`tests/unit/infrastructure/http/uploads.test.ts`** – unit tests for this module.

## Notes
- URLs come from what the middleware recorded, not from multer's `file.path`. The store builds them, so no filesystem separators end up in persisted values and local and CDN stores both work.
- An upload always beats a body `imageUrl: null`. In `writeWithUploadedImage`, `changedImageUrl` is only used when nothing was uploaded.
- A string `imageUrl` in the body is never passed through. A client-named path could let one record delete another's file.
- `deleteUpload` only touches files this request created, never anything the body named.
- Only the first element of each stored array is used, since these endpoints accept a single image.
- `bodyRecordOf` guards against an unset `request.body` (Express 5 leaves it unset when no parser matches the content type), and this protection applies to every image-accepting controller.
- If a request never calls `claimUpload` and ends 4xx/5xx, the close hook deletes its upload.
