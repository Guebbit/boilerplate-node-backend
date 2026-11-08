---
source: tests/unit/infrastructure/http/uploads.test.ts
sha256: 0c2831b60aeb7a6e5110f56e943d8d5f575df469952c6765fecb59174735cd9d
generated_at: 2026-11-08T10:18:57.457301+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/uploads.test.ts

## Purpose

Unit tests for the upload-helper functions in `src/infrastructure/http/uploads.ts`. They verify the uniform return shapes of `getFormFiles`, the URL-resolution and cleanup semantics of `readUploadedImage` (including the pending-vs-promoted and body-string edge cases), and the claim/unclaim lifecycle of `writeWithUploadedImage`. The `imageStore` adapter is fully mocked so no filesystem path is ever exercised.

## Key elements

- **`uploaded(path)`** — tiny factory returning a minimal `Express.Multer.File` stub (only `path`).
- **`requestWith(parts)`** — builds a partial `Request` stub with `body: {}` defaulted so `readUploadedImage`'s body-fallback branch never hits `undefined`.
- **`withUpload(parts)`** — wraps `requestWith` and pre-sets `storedThumbnailUrls: undefined` for upload-focused cases.
- **`store`** (`jest.mocked(imageStore)`) — typed handle on the mock, used to assert *which* store method (`remove` vs `removeQuarantined`) a cleanup opens.
- **`describe('getFormFiles')`** — single-file → array, no-file → `undefined`.
- **`describe('readUploadedImage')`** — stored URL passthrough, absolute-URL passthrough, first-of-many, no-upload → `undefined`, staged-path ignored, pending (quarantined) path with placeholders + `pendingImageKey`, promoted path with thumbnail, `deleteUpload()` calling the correct store door, body-string `imageUrl` dropped (undo touches nothing), body `null` preserved, upload beats body string/null, missing body safe.
- **`describe('writeWithUploadedImage')`** — success claims the upload (`uploadClaimed = true`) and passes the image to the write; refusal/error leaves it unclaimed; PUT-fill `null` is passed when nothing uploaded; a real upload (promoted or pending) overrides the PUT-fill null.

## Relationships

- **`src/infrastructure/http/uploads.ts`** — the module under test; all three exported helpers (`getFormFiles`, `readUploadedImage`, `writeWithUploadedImage`) are the SUTs.
- **`src/infrastructure/adapters/image-store.ts`** — mocked at module level; tests assert against `imageStore.remove` and `imageStore.removeQuarantined` to verify cleanup targets the correct storage door.
- **`src/infrastructure/http/config.ts`** — `uploadConfig()` is called for `NODE_PENDING_IMAGE_URL` and `NODE_PENDING_THUMBNAIL_URL` expected values in the pending-upload assertions.

## Notes

- The mock replaces the entire `imageStore` object; tests never touch real disk or network.
- `readUploadedImage` deliberately does **not** fall back to `request.file.path`; a test explicitly asserts a staged-but-uncommitted file yields `undefined` for `imageUrl`.
- `writeWithUploadedImage` mutates `request.uploadClaimed` in-place; tests verify this flag transitions only on a successful write, not on 4xx refusions or thrown errors.
- The `body.imageUrl` string case is a security-relevant scenario: the undo path must resolve to `false` without calling any store method, preventing accidental deletion of an unrelated image.
