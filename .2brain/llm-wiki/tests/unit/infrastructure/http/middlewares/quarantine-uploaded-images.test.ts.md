---
source: tests/unit/infrastructure/http/middlewares/quarantine-uploaded-images.test.ts
sha256: 90b6f05beed4cffc73ea62ceca4b241390946032a29ef9bd8d70a5d4d064513f
generated_at: 2026-11-08T10:15:04.814864+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/middlewares/quarantine-uploaded-images.test.ts

## Purpose

Unit tests for the `quarantineUploadedImages` middleware. The middleware is the single transition point between multer staging a file and the API having a usable image; these tests verify its contract across broker-ready and broker-unready modes, its failure/cleanup paths, and its response-close hook that reaps unclaimed uploads.

## Key elements

- **`uploaded(filePath)`** — helper that casts a `{ path }` object into an `Express.Multer.File` shape for test requests.
- **`fakeResponse(statusCode)`** — returns an `EventEmitter` with a `statusCode` property, standing in for Node's `ServerResponse` so the `close` event can be emitted manually.
- **`run(request, response?)`** — wraps the middleware call in a Promise that resolves with the value passed to `next`; this is how both success and error propagation are asserted.
- **`describe` "broker ready"** — covers: single-upload commit + key recording, no-file passthrough, quarantine rejection (error to `next` + staged-file deletion), and cleanup rejection still reaching `next`.
- **`describe` "no broker ready"** — covers: inline digest with promoted URL recording, `unavailable`/`connecting` states behaving identically to `disabled`, stem-stripping for multi-dot filenames, and digest rejection (quarantine-file removal + error to `next`).
- **`describe` "an unclaimed upload at close"** — covers: deletion on 4xx/5xx close (quarantined vs promoted URL), retention on 2xx close, and retention when `request.uploadClaimed` is true.
- **Mocks** — `imageStore` (quarantine/removeQuarantined/remove), `deleteFile`/`moveFile` from filesystem, `queueState`/`publishToQueue` from queue, and `digestQuarantinedImage` from image.worker.

## Relationships

- **`src/infrastructure/http/middlewares/upload.ts`** — the sole production import; exports the `quarantineUploadedImages` function under test. All assertions verify how that function interacts with its dependencies (which are mocked here) and how it mutates the Express `Request` object (`quarantinedImageKeys`, `storedImageUrls`, `storedThumbnailUrls`, `uploadClaimed`).

## Notes

- Error propagation is asserted via `next` (the `run` helper resolves with whatever the middleware passes to `next`), not via thrown exceptions. The middleware never throws; it always calls `next(err)` or `next()`.
- The `fakeResponse` uses `EventEmitter` rather than `EventTarget` (eslint suppression comment) because Node's `ServerResponse` is `EventEmitter`-based and the middleware listens for `'close'` on it.
- The stem passed as the second argument to `digestQuarantinedImage` is everything before the **last** dot in the quarantine key (e.g. `'a.b.png'` → `'a.b'`). This is regression-tested explicitly; the `promote` step appends the digested MIME extension, so passing the full key would double it.
- The "cleanup itself rejects" test documents a real invariant: the middleware's outer promise chain must catch the cleanup rejection, otherwise the request hangs (no 500 is ever sent).
