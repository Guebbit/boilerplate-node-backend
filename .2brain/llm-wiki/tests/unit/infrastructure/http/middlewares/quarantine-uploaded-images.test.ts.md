---
source: tests/unit/infrastructure/http/middlewares/quarantine-uploaded-images.test.ts
sha256: 78cbb34ba044c6a5870c1e7fac4fcc47fd37fe3b4386d4ce6f656b063faedc80
generated_at: 2026-09-27T16:07:03.641890+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/middlewares/quarantine-uploaded-images.test.ts

## Purpose

Unit tests for the `quarantineUploadedImages` Express middleware. They verify the middleware's two operational modes—deferring digestion to the queue when a broker is ready, or digesting inline when it is not—and assert every failure/cleanup path. The image store, filesystem, queue, and worker are all mocked; only the middleware's decision logic is under test.

## Key elements

- **`uploaded(filePath)`** — tiny factory returning a minimal `Express.Multer.File` stub.
- **`run(request)`** — wraps the middleware call in a Promise; passes `resolve` as the `next` callback so that the value handed to `next` (or the error object) is what the assertion receives.
- **`describe("broker ready")`** — four cases:
  - Single upload commits and records `quarantinedImageKeys` on the request; no inline digest.
  - No file on the request → passthrough, store untouched.
  - Store rejects → the rejection is passed to `next` and the staged file is deleted via `deleteFile`.
  - Store rejects *and* `deleteFile` also rejects → the request still reaches `next` (guards against a hung promise chain).
- **`describe("no broker ready")`** — five cases:
  - Inline digest runs, promoted URLs land on `request.storedImageUrls` / `storedThumbnailUrls`, and `quarantinedImageKeys` stays `undefined`.
  - Parameterised over `'unavailable'` and `'connecting'` — both route to the inline path identically to `'disabled'`.
  - Multi-dot key (`a.b.png`) → stem is `'a.b'`, not `'a'` (regression: passing the raw key doubled the extension).
  - Digest rejects → `imageStore.removeQuarantined` is called for cleanup and the rejection is forwarded to `next`.

## Relationships

- **`src/infrastructure/http/middlewares/upload.ts`** — the sole production import; `quarantineUploadedImages` is the function under test. Every assertion in this file validates behavior that function implements.
- Mocked adapters (`image-store`, `filesystem`, `queue`, `image.worker`) are stubbed at the module level and are *not* graph neighbors of this test file; they exist only as in-file fakes to isolate the middleware.

## Notes

- The `run` helper intentionally resolves (not rejects) with whatever the middleware passes to `next`, so failure-path assertions use `resolves.toBe(error)` rather than `rejects`. This mirrors how the middleware reports errors in production (via `next(err)`), but it means a *hung* middleware would cause a test timeout, not a clean failure.
- The cleanup-rejection test ("still reaches next() when the cleanup itself rejects") exists because the middleware's `deleteFile` call is an unchained promise; without a `.catch()` on the middleware's own chain, a second rejection would never reach `next` and the request would hang.
- The multi-dot regression test documents that `resolveUploadFilename` only mints `<hex>.<ext>`, but the stem-stripping logic must not assume exactly one dot.
- Cleanup uses different functions depending on the failure point: `deleteFile` (filesystem) for a failed quarantine commit, `imageStore.removeQuarantined` for a failed inline digest.
