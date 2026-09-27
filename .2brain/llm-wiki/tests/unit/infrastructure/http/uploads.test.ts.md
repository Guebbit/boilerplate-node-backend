---
source: tests/unit/infrastructure/http/uploads.test.ts
sha256: 8d4bf131f56818cc30f41f6fa431ad3c3f53bf185697660ebb307b0934e5a5ea
generated_at: 2026-09-27T16:08:08.291337+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/uploads.test.ts

## Purpose

Unit tests for the two upload-helper functions exported by `src/infrastructure/http/uploads.ts`. The tests exist to lock down two invariants: `getFormFiles` always yields a uniform array shape (or `undefined`), and `readUploadedImage` returns only the URL the store recorded—never a raw filesystem path.

## Key elements

- **`uploaded(path)`** – local helper that produces a minimal `Express.Multer.File` stub (only `path` is set).
- **`requestWith(parts)`** – local helper that builds a partial `Request` with `body` defaulted to `{}`, preventing `readUploadedImage`'s `body.imageUrl` fallback branch from ever seeing `undefined`.
- **`describe('getFormFiles')`** – verifies the single-file wrap (`multer.single` → `['path']`) and the no-upload case (`undefined`).
- **`describe('readUploadedImage')`** – verifies:
  - Stored relative URL is returned as-is.
  - Absolute (remote/CDN) URLs pass through unchanged.
  - Only the **first** entry in `storedImageUrls` is used; extras are ignored.
  - `imageUrl` is `undefined` (not `''`) when nothing was uploaded.
  - A staged `request.file` path that the store never committed is **not** used as a fallback.

## Relationships

- **`src/infrastructure/http/uploads.ts`** – the module under test; this file imports `getFormFiles` and `readUploadedImage` from it via the `@infrastructure/http/uploads` alias.
- **Express types** – the stubs reference `Request` and `Express.Multer.File` to shape the objects the helpers consume.

## Notes

- The `undefined`-vs-`''` distinction in `readUploadedImage` is load-bearing: downstream cleanup logic treats `undefined` as "no image, skip delete" and an empty string as "image at site root, attempt delete." The test suite pins this contract.
- The "ignore staged path" test is a regression guard: the store (not the middleware) is responsible for constructing URLs, so `readUploadedImage` must never fall back to `request.file.path`. If it did, a filesystem path would leak into `imageUrl` and persist to the database.
- `requestWith` defaults `body` to `{}` specifically so the `body.imageUrl` fallback branch inside `readUploadedImage` is exercised with a known value; `getFormFiles` tests are unaffected because that function never reads `body`.
