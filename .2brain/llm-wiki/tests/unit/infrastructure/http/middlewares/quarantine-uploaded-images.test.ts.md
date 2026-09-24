---
source: tests/unit/infrastructure/http/middlewares/quarantine-uploaded-images.test.ts
sha256: c66cad34d8df1c43d969a1ce6f819839d921179d6adcaa36a632db1680312f5e
generated_at: 2026-09-23T20:21:37.458321+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/middlewares/quarantine-uploaded-images.test.ts

## Purpose

Unit tests for the `quarantineUploadedImages` Express middleware. They verify that a multer-staged upload is either committed to the image store (broker ready) or digested inline (broker not ready), and that every failure path—store rejection, partial multi-file failure, cleanup rejection, digest rejection—resolves through `next()` with an error rather than hanging the request.

## Key elements

- **`run(request)`** — Wraps the middleware call in a `Promise`, using `resolve` as `next`. All assertions go through the value passed to `next` (either `undefined` for success or the `Error` instance for failure).
- **`uploaded(filePath)`** — Minimal factory that casts a `{ path }` object to `Express.Multer.File`.
- **`describe('quarantineUploadedImages — broker ready')`** — Covers: single-file commit, multi-file commit (order preserved), no-op when no file present, store rejection, staged-file cleanup on rejection, partial-success sibling cleanup (`removeQuarantined` called for the one that succeeded), and the edge case where cleanup itself rejects.
- **`describe('quarantineUploadedImages — no broker ready')`** — Covers: inline digest producing `storedImageUrls`/`storedThumbnailUrls` (no `quarantinedImageKeys`), parameterized test over `'unavailable'` and `'connecting'` states, multi-file inline digest order, and digest rejection triggering quarantine-file removal.
- **Mocks** — `imageStore` (quarantine, removeQuarantined), `deleteFile`, `queueState`, `publishToQueue`, `digestQuarantinedImage`. All are `jest.fn()` stubs; no real I/O occurs.

## Relationships

- **`src/infrastructure/http/middlewares/upload.ts`** — The sole production dependency under test. This file imports `quarantineUploadedImages` from it and asserts every branch of its behavior (quarantine → key recording vs. inline digest → URL recording, plus all error/cleanup paths).

## Notes

- Errors are asserted as the *resolved value* of `run(...)`, not as rejections. The middleware is expected to call `next(err)` rather than throw; a test that did `await expect(...).rejects` would be testing the wrong contract.
- The "cleanup itself rejects" test exists specifically because the cleanup is a promise chain with no local `.catch`; without the middleware's outer catch, a rejection there would leave the request hanging silently.
- `publishToQueue` is mocked but never directly asserted upon in these tests—the "ready" path only verifies that `quarantine` was called and keys were recorded; the actual queue publish is presumably covered elsewhere or is a fire-and-forget side effect.
- Multi-file tests assert **order** of keys/URLs, which pins the implementation to a sequential loop rather than a `Promise.all` over unordered results.
