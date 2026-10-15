---
source: tests/unit/infrastructure/http/middlewares/upload.test.ts
sha256: cb27c281ca91d93267fce1ca810495ec1c262a06cf287ec7f9cc5e0c27f711d4
generated_at: 2026-10-15T13:14:50.212144+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/middlewares/upload.test.ts

## Purpose

Unit tests for the upload security middleware exported from `@infrastructure/http/middlewares/upload`. Each exported callback (`fileFilter`, `resolveUploadDestination`, `resolveUploadFilename`, `maxUploadBytes`, `validateUploadedImages`) is the enforcement point for one aspect of upload safety (field whitelist, server-generated filename, type gate, byte-level content check, size cap). The tests are written against the *guarantees* a reviewer expects, not against implementation lines, so refactors that preserve the guarantees keep the suite green.

## Key elements

- **`fileOf(overrides?)`** – factory that produces a default `Express.Multer.File` (`imageUpload` / `holiday.png` / `image/png`) with optional field overrides.
- **`accepted(file)`** – wraps `fileFilter`'s callback into a synchronous `boolean` ("did the filter accept this file?").
- **`capture(run)` / `captureAsync(run)`** – generic helpers that execute a `(error, value)` callback-style function and return both arms (sync and `Promise`-based, respectively).
- **`requestWithFile(filePath, mimetype?)`** – builds a stub `Request` shaped like `multer.single()` output, carrying `file.path` and `file.mimetype`.
- **`runMiddleware(request)`** – invokes `validateUploadedImages`, wiring a `next` mock and a `makeResponseStub` response; resolves once the middleware settles (pass-through or in-place JSON reply).
- **`describe('maxUploadBytes')`** – asserts the value is read at call-time, defaults to 5 MiB for blank, and throws on non-numeric / non-positive strings.
- **`describe('resolveUploadDestination')`** – asserts the staging directory is created if missing, is never inside the public/static root, and that unknown field names are rejected (whitelist, not blacklist).
- **`describe('resolveUploadFilename')`** – asserts the stored name is a 32-hex random string + extension, ignores client-supplied `originalname`, produces unique names across 50 calls, and falls back to `.bin` for unrecognised mimetypes.
- **`describe('fileFilter')`** – accepts `image/png`, `image/jpeg`, `image/jpg`; rejects `application/pdf`, `text/html`, `image/svg+xml`, `application/octet-stream`; and confirms a rejection *drops* the file (callback error is `null`) rather than failing the request.
- **`describe('validateUploadedImages')`** – the byte-level content check. Mocks `identifyImageFile`, `deleteFile`, and `logger`. Verifies that (1) non-image bytes are rejected, (2) image bytes that mismatch the declared type are rejected, (3) rejected files are deleted, and (4) the middleware settles via `next` or `res.json` appropriately.

## Relationships

- **`src/infrastructure/http/middlewares/upload.ts`** – the module under test; all six exports are imported and exercised here.
- **`src/infrastructure/config/store.ts`** – `currentEnvironment()` is called to resolve `NODE_PUBLIC_PATH`, used to assert the staging directory is outside the public root.
- **`tests/support/environment.ts`** – `setEnvironment()` is the mechanism for injecting `NODE_MAX_UPLOAD_BYTES` and `NODE_UPLOAD_STAGING_PATH` per-test.
- **`tests/support/express.ts`** – `makeResponseStub()` provides a mock `res` object for the `validateUploadedImages` middleware test.
- **`tests/support/stub.ts`** – `asStub<T>()` is used throughout to satisfy TypeScript's structural typing when passing plain objects where `Request`, `FileFilterCallback`, etc. are expected.
- **`src/infrastructure/adapters/logger.ts`** – mocked (all log methods stubbed) so that `validateUploadedImages` calls do not produce side-effect noise or depend on a real logger instance.

## Notes

- The file uses `jest.mock` for `@infrastructure/adapters/image-signatures` and `@infrastructure/adapters/filesystem` with `jest.requireActual` spread, so only the specific functions (`identifyImageFile`, `deleteFile`) are replaced; everything else in those modules remains real.
- `fileFilter` rejection semantics: the callback receives `(null, false)` — the file is silently dropped, the request proceeds without `req.file`. This is intentionally pinned because the intuitive alternative (rejection → error response) is *not* the implemented behaviour.
- `maxUploadBytes` is designed to be called at request time (not at module import) so that `dotenv` / `.env` loading order does not freeze the value. The test asserts this by setting the env var *after* import.
- The staging-path test uses a deliberately non-existent subdirectory (`mkdtemp` + `/uploads`) to verify the resolver creates it; multer itself does not `mkdir` the destination.
- Filename randomness is asserted by collecting 50 outputs into a `Set` and checking size === 50 — this catches accidental reuse of a counter or a fixed seed.
