---
source: src/infrastructure/http/uploads.ts
sha256: cf8b4ef48efe8d210d38a1a99ba2fb9efa9fcc87a0448f3225f04fedb2039fa8
generated_at: 2026-10-14T08:01:33.010986+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/uploads.ts

## Purpose

Read-side helpers for multipart image uploads. The upload middleware (write side) handles where files land and how they are named; this module only normalises what the middleware left on the Express request, producing a uniform `RequestImage` shape that controllers consume to decide what image URL to persist, whether a digest job is pending, and how to roll back on error.

## Key elements

- **`getFormFiles(request)`** — extracts `request.file.path` (the only shape multer populates under `multer.single()`) and returns it as `string[] | undefined` for a uniform caller-facing shape.
- **`RequestImage`** (interface) — the four-field contract a write controller needs: `imageUrl`, `thumbnailUrl`, `pendingImageKey`, and a `deleteUpload()` undo closure scoped to this request's upload only.
- **`readUploadedImage(request)`** — main entry point. Reads back the middleware's recorded values (`storedImageUrls`, `storedThumbnailUrls`, `quarantinedImageKeys`) and returns one of three shapes: promoted (inline-digested), pending (broker will digest later), or no-upload (honours only literal `null` from body as "remove"; any string is dropped).
- **`claimUpload(request)`** — sets `request.uploadClaimed = true` so the middleware's close hook (`releaseUnclaimedUpload`) skips deletion. Call after the row is saved.
- **`ImageChanges`** (type) — `Pick<RequestImage, 'imageUrl' | 'thumbnailUrl' | 'pendingImageKey'>`; the subset a service/repository actually writes.
- **`writeWithUploadedImage(request, changedImageUrl, write)`** — wrapper that calls `readUploadedImage`, folds the image fields into the `write` call, and invokes `claimUpload` on success. A thrown or `success: false` write leaves the upload unclaimed so the close hook cleans it up.

## Relationships

- **`src/infrastructure/http/middlewares/upload.ts`** — produces the request properties this module reads (`storedImageUrls`, `storedThumbnailUrls`, `quarantinedImageKeys`, `uploadClaimed`). This module is its read counterpart.
- **`src/infrastructure/adapters/image-store.ts`** — `imageStore.remove()` and `imageStore.removeQuarantined()` are called inside the `deleteUpload` closures for rollback on error.
- **`src/infrastructure/http/config.ts`** — provides `uploadConfig()` to obtain the `NODE_PENDING_IMAGE_URL` / `NODE_PENDING_THUMBNAIL_URL` placeholders returned when a broker will digest the image later.
- **`src/infrastructure/http/request.ts`** — `bodyRecordOf()` safely reads `request.body` (Express 5 leaves it unset when no parser matched the content-type).
- **Controllers** (`update-account`, `put-example-cover`, `create-product`, `update-product`, `create-user`, `update-user`) — primary consumers; they call `writeWithUploadedImage` or `readUploadedImage` directly.
- **`tests/unit/infrastructure/http/uploads.test.ts`** — unit tests covering the three `readUploadedImage` branches and the claim/unclaim lifecycle.

## Notes

- Upload always outranks body `imageUrl: null`. A caller that sent bytes expressed a stronger intent; the literal `null` is honoured only when no file was uploaded.
- Body-supplied URL **strings** are never forwarded into the persisted record — only the literal `null` (remove) or `undefined` (no change) survive. This prevents a client-named path from causing cross-record deletion.
- `deleteUpload` is deliberately scoped to *this* request's upload. It never deletes a file named in the body, even if that path coincidentally matches.
- The `[0]` indexing on the middleware's arrays is intentional: these endpoints accept a single image; extra files are ignored.
- Call `claimUpload` exactly once, after the DB row naming the image is persisted. Forgetting it causes the close hook to delete a file that a successful write is about to reference.
