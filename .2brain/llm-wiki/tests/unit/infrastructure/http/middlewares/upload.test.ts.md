---
source: tests/unit/infrastructure/http/middlewares/upload.test.ts
sha256: f4ad2c2aede20d1cb26edf548f0f542405b572704636715d8cf3e934063d99bf
generated_at: 2026-11-08T10:17:17.684798+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/middlewares/upload.test.ts

## Purpose

Unit tests for the upload security middleware in `src/infrastructure/http/middlewares/upload.ts`. Covers the four guarantees that form the repo's upload boundary: field-name whitelisting, client-independent filename generation, declared-MIME filtering, and post-write content validation (with cleanup of rejected files). The tests are written against behaviour a reviewer would want guaranteed, so a refactor that preserves the guarantees should keep them green.

## Key elements

- **`fileOf(overrides)`** – factory that builds a default `Express.Multer.File` stub (`imageUpload` / `holiday.png` / `image/png`) with per-test overrides.
- **`filtered(file)` / `accepted(file)`** – wrappers around `fileFilter`'s `(error, accept)` callback, returning the outcome or a boolean pass/fail.
- **`capture(run)` / `captureAsync(run)`** – generic helpers that turn a Node-style `(error, value) => void` callback function into a synchronous or Promise-resolved `{ error, value }` pair. Used for `resolveUploadDestination` and `resolveUploadFilename`.
- **`runMiddleware(request)`** – runs `validateUploadedImages` with a stubbed `next` and `response`, resolving once the middleware settles (pass-through via `next` or in-place `response.json`).
- **`describe('maxUploadBytes')`** – asserts the value is read at call time (not import time), defaults to 5 MiB for blank/unset, and throws on non-numeric or non-positive input.
- **`describe('resolveUploadDestination')`** – verifies the staging directory is created on demand, that it never falls inside the served public root, and that unknown `fieldname` values are rejected (whitelist, not blacklist).
- **`describe('resolveUploadFilename')`** – asserts the stored name is a 32-hex random string (independent of `originalname`), is unique across 50 calls, and falls back to `.bin` for unrecognised MIME types.
- **`describe('fileFilter')`** – confirms acceptance of `image/png`, `image/jpeg`, `image/jpg`; rejection of PDFs, HTML, SVG, octet-stream; and that a rejected file produces an `Error` (→ 415) rather than a silent drop.
- **`describe('validateUploadedImages')`** – mocks `identifyImageFile` and `deleteFile` to test: bytes-not-an-image rejection, image-bytes-but-wrong-declared-type rejection, and that a rejected file is deleted from disk.

## Relationships

- **`src/infrastructure/http/middlewares/upload.ts`** – the unit under test; all exported functions (`fileFilter`, `maxUploadBytes`, `resolveUploadDestination`, `resolveUploadFilename`, `uploadStagingPath`, `validateUploadedImages`) are exercised here.
- **`src/infrastructure/config/store.ts`** – `currentEnvironment()` is read to derive the public-root path for the "staging never inside public" assertion.
- **`src/infrastructure/adapters/logger.ts`** – mocked entirely (all methods no-op) so tests do not emit log noise.
- **`tests/support/stub.ts`** – `asStub<T>()` casts partial objects to full types without `as unknown as`.
- **`tests/support/express.ts`** – `makeResponseStub()` provides a pre-mocked Express `Response` for `runMiddleware`.
- **`tests/support/environment.ts`** – `setEnvironment(vars)` injects/removes `process.env` values per test for config-dependent assertions.

## Notes

- `maxUploadBytes` is asserted to be **call-time**, not import-time, because multer freezes `limits` at instance construction. Any test that builds the multer instance before setting the env var would mask a regression.
- `resolveUploadDestination` tests use a deliberately non-existent subdirectory under a fresh `mkdtemp` path to prove the resolver calls `mkdir` — multer itself does not create the destination.
- `validateUploadedImages` tests mock both `@infrastructure/adapters/image-signatures` and `@infrastructure/adapters/filesystem` at the module level via `jest.mock` (placed after the imports they mock). The `deleteFile` mock is asserted to be called on rejection — leaving rejected files on disk defeats the staging-directory isolation.
- The file is truncated in the provided content; the `validateUploadedImages` suite likely contains additional cases beyond what is visible (e.g., the pass-through happy path, the `.catch()` error branch).
