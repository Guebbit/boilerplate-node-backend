---
source: src/infrastructure/http/uploads.ts
sha256: 6ac831de868d45d706b009a9984107d463fbab841b14f5918403b6b3aac5f8b6
generated_at: 2026-09-23T17:46:17.522242+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/uploads.ts

## Purpose

Read-side helpers for file uploads. This module normalizes whatever the multer middleware left on the Express request into a uniform shape that controllers can consume, so that individual endpoints never inspect `request.file` / `request.files` or the middleware's stored-URL arrays directly. The write side (naming, landing, digestion) lives in the upload middleware; this file only interprets the result.

## Key elements

- **`getFormFiles(request: Request): string[] | undefined`** — Returns a flat array of file paths regardless of whether the route used `multer.single()`, `.array()`, or `.fields()`. Returns `undefined` when no file was uploaded (including the "present but empty" edge case), giving callers one falsy check.
- **`RequestImage` (interface)** — The contract a write controller receives for the image half of a request: `imageUrl`, `thumbnailUrl`, `pendingImageKey` (quarantine key for async digest), and `deleteUpload()` (a one-shot undo that removes only files *this* request created).
- **`readUploadedImage(request): RequestImage`** — Reads back the URLs/keys the upload middleware recorded (`storedImageUrls`, `storedThumbnailUrls`, `quarantinedImageKeys`). Priority: inline-digested URL → pending/quarantine placeholder → body-supplied `imageUrl`. Wires `deleteUpload` to `imageStore.remove` or `imageStore.removeQuarantined` accordingly. Falls through to `bodyRecordOf(request).imageUrl` for body-only cases.

## Relationships

- **`@infrastructure/adapters/image-store`** — Imported as `imageStore`; `readUploadedImage` delegates its `deleteUpload` closures to `imageStore.remove()` (promoted files) and `imageStore.removeQuarantined()` (pending files).
- **`@infrastructure/http/middlewares/upload`** — The producer side. That middleware populates `request.storedImageUrls`, `request.storedThumbnailUrls`, and `request.quarantinedImageKeys`, which `readUploadedImage` reads. The two files are the read/write halves of the same upload flow.
- **`@infrastructure/http/request`** — Provides `bodyRecordOf`, used to safely access `request.body` (Express 5 may leave it unset) when falling through to a body-supplied `imageUrl`.
- **Controllers** (`post-signup`, `put-account`, `create-product`, `update-product`, `write-users`) — Primary consumers; they call `readUploadedImage` to obtain the `RequestImage` they persist, and call `getFormFiles` when they need raw paths.
- **`tests/unit/infrastructure/http/uploads.test.ts`** — Unit tests covering the normalization and priority logic.

## Notes

- `readUploadedImage` intentionally reads URLs **from the middleware's stored arrays**, not from multer's raw `path` field. This keeps filesystem separators out of persisted values and lets the store swap between local paths and CDN URLs transparently.
- Only index `[0]` is read: these endpoints accept a single image; extras are silently ignored.
- In the body-only fallback, non-string `imageUrl` values (numbers, booleans) are passed through as-is (cast to `string | undefined`) so that Zod can reject them with the correct 422 message. Coercing to `undefined` would trigger the controller's `= ''` default and mask the type error.
- `deleteUpload` is deliberately scoped to files created by *this* request. It must never delete a body-supplied `imageUrl`, which belongs to a prior upload.
