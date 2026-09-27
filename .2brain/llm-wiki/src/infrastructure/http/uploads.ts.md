---
source: src/infrastructure/http/uploads.ts
sha256: 7ae7acfe0ab291c0305c2c6b01aa19cef90c05097c358429d506a7943d021ab1
generated_at: 2026-09-27T14:11:23.685881+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/uploads.ts

## Purpose

Read-side helpers for image uploads. After the multer middleware (in `middlewares/upload`) has stashed file metadata on the Express request, this module normalizes that state into a uniform `RequestImage` object and provides a write wrapper that cleans up orphaned files when a controller fails. It is shared by every image-accepting controller so the three upload paths (inline digest, broker/pending, body-only) are handled in one place.

## Key elements

- **`getFormFiles(request)`** – Returns `[request.file.path]` or `undefined`. Thin wrapper so callers get an array shape even though only `multer.single()` is ever mounted.
- **`RequestImage`** – Interface describing the image half of a write request: `imageUrl`, `thumbnailUrl`, `pendingImageKey`, and a `deleteUpload()` undo callback.
- **`readUploadedImage(request)`** – Inspects middleware-attached properties (`storedImageUrls`, `storedThumbnailUrls`, `quarantinedImageKeys`) and falls back to `body.imageUrl`. Returns a `RequestImage` for one of three states: inline-digested, quarantined/pending, or no-upload (body-only).
- **`ImageChanges`** – `Pick<RequestImage, 'imageUrl' | 'thumbnailUrl' | 'pendingImageKey'>`; the persistable subset without the undo callback.
- **`writeWithUploadedImage(request, changedImageUrl, write)`** – Calls `readUploadedImage`, passes the image fields into the caller's `write` function, and on failure (thrown error or `{ success: false }`) invokes `deleteUpload()` before re-throwing / returning. Upload always takes precedence over `changedImageUrl`.

## Relationships

- **`middlewares/upload.ts`** – Produces the state this file reads. The middleware populates `request.storedImageUrls`, `request.storedThumbnailUrls`, and `request.quarantinedImageKeys`; this module never touches raw multer paths.
- **`adapters/image-store.ts`** – `imageStore.remove(url)` and `imageStore.removeQuarantined(key)` are the two operations delegated to from `deleteUpload` callbacks.
- **`http/request.ts`** – Supplies `bodyRecordOf`, used to safely read `request.body.imageUrl` (guards Express 5's unset-body case).
- **Controllers** (`post-signup`, `update-account`, `create-product`, `update-product`, `create-user`, `update-user`) – Consume `readUploadedImage` and/or `writeWithUploadedImage` to persist or reject image changes.
- **`tests/unit/infrastructure/http/uploads.test.ts`** – Unit tests for the three `readUploadedImage` branches and the `writeWithUploadedImage` cleanup logic.

## Notes

- **Precedence rule:** An uploaded file always outranks a body-supplied `imageUrl`. A caller that sent bytes expressed stronger intent.
- **Sentinel values matter:** `undefined` = "no change" (update-schema `.optional()`), `null` = "clear the image", string = "persist this URL". Never default `imageUrl` to `''`—it would bypass zod's `minLength: 1` check and mask a 422 as a 200.
- **Reads middleware state, not paths:** URLs come from `imageStore`'s constructed output (local path *or* CDN URL), so controllers stay store-agnostic.
- **Single image only:** All array accesses use `[0]`; additional files are silently ignored.
- **Non-string body values pass through untouched** (number, bool, etc.) so zod can reject them with the correct i18n message rather than being silently coerced.
- **`deleteUpload` is never keyed on a body `imageUrl`**—deleting a file this request didn't create would be destructive.
