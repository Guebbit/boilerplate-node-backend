---
source: tests/unit/infrastructure/http/middlewares/upload.test.ts
sha256: bc176099c4fb468ab5b614d5fcf93d5ac6a339e91de25274b12231855e65e004
generated_at: 2026-09-23T20:22:47.614469+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/middlewares/upload.test.ts

## Purpose

Unit tests for the five exported helpers in the upload middleware (`maxUploadBytes`, `resolveUploadDestination`, `resolveUploadFilename`, `fileFilter`, `validateUploadedImages`). They pin down the upload security guarantees—field whitelisting, server-generated filenames, MIME filtering, and content-type verification—by asserting observable behaviour rather than implementation details, so a refactor that preserves the guarantees keeps these green.

## Key elements

- **`fileOf(overrides?)`** – Factory returning a minimal `Express.Multer.File` fixture with sensible defaults (`image/png`, `imageUpload` field).
- **`accepted(file)`** – Invokes `fileFilter` with a stub callback and returns the boolean accept/reject result.
- **`capture(run)`** / **`captureAsync(run)`** – Helpers that call a multer-style `(error, value) => void` callback and return both arms; the async variant wraps it in a Promise.
- **`maxUploadBytes` block** – Verifies the value is read at call time (not import time) and that invalid env values fall back to 5 MiB.
- **`resolveUploadDestination` block** – Creates a real temp dir via `mkdtemp`, asserts the resolver creates it, that staging never falls inside the served public path, and that unknown field names are rejected rather than defaulted.
- **`resolveUploadFilename` block** – Asserts the output is a 32-hex-digit name with a safe extension regardless of client-supplied `originalname`; checks uniqueness across 50 calls; verifies an unrecognised MIME type maps to a `.bin` extension.
- **`fileFilter` block** – Confirms accepted/rejected MIME types and that a rejected file is _dropped_ (callback receives `null` error) rather than surfaced as a request error.
- **`validateUploadedImages` block** (truncated) – Mocks `identifyImageFile`, `deleteFile`, and `logger`; uses `requestWithFile` / `requestWithFiles` fixtures for the `multer.single()` and `multer.array()` shapes; a `runMiddleware` helper resolves on either `next()` or a direct response write.
- **`jest.mock` calls** – Replace `@infrastructure/adapters/image-signatures`, `@infrastructure/adapters/filesystem`, and `@infrastructure/adapters/logger` with `jest.fn()` stubs.

## Relationships

- **`src/infrastructure/http/middlewares/upload.ts`** – The module under test; all five exported functions are imported and exercised directly.
- **`tests/support/stub.ts`** – Provides `asStub`, used to create typed no-op callbacks and request/response stubs throughout the file.
- **`tests/support/express.ts`** – Provides `makeResponseStub`, imported for use in the `validateUploadedImages` assertions (response-write path).

## Notes

- Tests that touch the filesystem (`resolveUploadDestination`) create a real `mkdtemp` directory and remove it in `afterEach`; they do **not** rely on `jest.mock` for `node:fs/promises`.
- `maxUploadBytes` is tested against `process.env.NODE_MAX_UPLOAD_BYTES`; the original value is saved/restored per test to avoid cross-contamination.
- The `fileFilter` "dropped, not errored" test is intentional: multer's contract is that a rejected file simply does not appear on `request.file`, and the callback's first argument is `null`. Handlers must treat a missing file as a validation failure.
- `validateUploadedImages` has **two** rejection axes: (1) bytes are not an image at all, (2) bytes are an image but a _different_ type than declared. Both must result in the file being deleted.
- The file is truncated in this snapshot; the `runMiddleware` helper and the full `validateUploadedImages` test cases continue beyond the visible portion.
