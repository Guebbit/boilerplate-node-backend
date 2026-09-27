---
source: tests/unit/infrastructure/http/middlewares/upload.test.ts
sha256: 3fe9072531e5eb005000bd1b07af7b2bd91f2aeba20795f2296ad2eeb58178b4
generated_at: 2026-09-27T16:07:58.672887+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/middlewares/upload.test.ts

## Purpose

Unit tests for the upload-middleware security controls: the field whitelist, filename randomisation, size-cap resolution, and the late content-check that verifies uploaded bytes actually match the declared image type. The tests are written against the security guarantees a reviewer would want pinned, not against implementation lines, so a refactor that preserves the guarantees keeps the suite green.

## Key elements

- **`maxUploadBytes` tests** — asserts the cap is read from `NODE_MAX_UPLOAD_BYTES` at call time (not import time) and falls back to 5 MiB for empty/invalid values.
- **`resolveUploadDestination` tests** — verifies the staging directory is created on first use, is never inside the served `public` root, and rejects unknown `fieldname` values (whitelist, not blacklist).
- **`resolveUploadFilename` tests** — confirms the stored filename is a random 32-char hex string with a safe extension, independent of `originalname`; unrecognised mimetypes get a `.bin` extension; 50 calls yield 50 unique names.
- **`fileFilter` tests** — accepts `image/png|jpeg|jpg`; rejects everything else. Critically pins that rejection *drops* the file (callback `error` is `null`) rather than surfacing an error to the request.
- **`validateUploadedImages` tests** — the content-check middleware. Verifies it reads leading bytes via `identifyImageFile`, rejects both non-image bytes and type mismatches (e.g. JPEG stored as `.png`), and deletes the staged file on rejection. Mocks `image-signatures`, `filesystem`, and `logger` adapters.
- **Helpers** — `fileOf` (default `Multer.File`), `accepted` (wraps `fileFilter` callback), `capture` / `captureAsync` (wraps `(error, value)` callbacks), `requestWithFile` (stubs a `request.file` shape), `runMiddleware` (resolves when `next` or `response.json` settles).

## Relationships

- **`src/infrastructure/http/middlewares/upload.ts`** — the module under test; all exported functions (`fileFilter`, `maxUploadBytes`, `resolveUploadDestination`, `resolveUploadFilename`, `uploadStagingPath`, `validateUploadedImages`) are imported and exercised here.
- **`tests/support/stub.ts`** — provides `asStub`, used to cast loosely-typed objects into `Request`, `FileFilterCallback`, and other typed signatures without runtime mutation.
- **`tests/support/express.ts`** — provides `makeResponseStub`, used by `runMiddleware` to capture `response.json` calls and settle the middleware promise.

## Notes

- The `maxUploadBytes` test deliberately sets `process.env` *after* import to prove the value is read at call time; the `afterEach` restores the original (or deletes the key) to avoid cross-test contamination.
- `resolveUploadDestination` tests create a fresh temp dir per test (`mkdtemp`) and assert it does **not** pre-exist, because multer will not `mkdir` the destination itself.
- The `fileFilter` "drops rather than errors" test is explicit: the alternative reading (rejection → request error) is the intuitive one and is wrong. Downstream handlers must treat a missing `request.file` as a validation failure.
- `validateUploadedImages` mocks are registered at module level via `jest.mock` with `requireActual` spread, so only `identifyImageFile`, `deleteFile`, and `logger` are replaced while the rest of each module stays real.
- The test file is truncated in this snapshot; the `validateUploadedImages` `describe` block's full test cases are not visible.
