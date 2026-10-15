---
source: tests/unit/infrastructure/http/middlewares/quarantine-uploaded-images.test.ts
sha256: 90b6f05beed4cffc73ea62ceca4b241390946032a29ef9bd8d70a5d4d064513f
generated_at: 2026-10-15T13:12:59.948276+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/middlewares/quarantine-uploaded-images.test.ts

## Purpose

Unit tests for the `quarantineUploadedImages` middleware. Verifies its three behavioral contracts: (1) committing a staged file to the image store and recording the key when the queue is ready, (2) digesting inline (no pending key left behind) when the broker is `disabled`, `unavailable`, or `connecting`, and (3) deleting an unclaimed upload via a `close` event hook when the response ends with an error status. The store, filesystem, queue, and worker adapters are all mocked; the middleware's own decision logic and error handling is what's under test.

## Key elements

- **`run(request, response?)`** — wraps the middleware call in a `Promise`, resolving with whatever value is passed to `next()`. Used by every test as the entry point.
- **`fakeResponse(statusCode?)`** — returns an `EventEmitter` augmented with a `statusCode` property, standing in for Node's `ServerResponse` so tests can `emit('close')` to trigger the cleanup hook.
- **`uploaded(filePath)`** — tiny factory returning a minimal `Express.Multer.File`-shaped object.
- **`describe` "broker ready"** — asserts: single upload commits and sets `request.quarantinedImageKeys`; no-file request passes through untouched; store rejection deletes the staged file via `deleteFile` and forwards the error; a failing `deleteFile` still reaches `next()` (no hang).
- **`describe` "no broker ready"** — asserts: inline digest is called with `(key, stem)` and `request.storedImageUrls` / `storedThumbnailUrls` are set while `quarantinedImageKeys` stays `undefined`; `unavailable` and `connecting` states behave identically to `disabled`; a multi-dot key (`a.b.png`) is salted with `a.b` (last-dot split); a rejected digest calls `imageStore.removeQuarantined` and forwards the error.
- **`describe` "an unclaimed upload at close"** — asserts: on `close` with 400/422/500 the pending key is removed via `removeQuarantined`; an inline-digested upload is removed by its promoted URL via `imageStore.remove`; a 2xx close leaves the file; a claimed upload (`request.uploadClaimed = true`) is kept even on error.

## Relationships

- **`src/infrastructure/http/middlewares/upload.ts`** — the sole SUT. The test imports `quarantineUploadedImages` from there and exercises its exported behavior. All adapter mocks (`imageStore`, `deleteFile`, `moveFile`, `queueState`, `publishToQueue`, `digestQuarantinedImage`) correspond to modules that `upload.ts` calls internally; the test never exercises those modules directly.

## Notes

- `fakeResponse` deliberately uses `EventEmitter` rather than `EventTarget` because the middleware hooks into Node's `ServerResponse` `close` event; the `eslint-disable` comment in the file documents this.
- The "stem" argument to `digestQuarantinedImage` is the key with its **final** extension stripped (not `path.parse`-style, which would break on multi-dot names). The `a.b.png → a.b` test is regression coverage for a bug where the full key was passed, doubling the extension in the promoted filename.
- The "cleanup rejects" test exists because the middleware's outer promise chain has no standalone `.catch()`; without it, a `deleteFile` rejection would hang the request instead of producing a 500.
- Tests use `jest.requireMock` after the `jest.mock` factory to obtain typed references; this is the standard pattern to satisfy both Jest's hoisting and TypeScript's type-checking.
