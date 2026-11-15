---
source: src/infrastructure/http/middlewares/upload.ts
sha256: 77ce65e73c21395120c2bf34629e4ab2d2006edfc361550a885f079268ae717d
generated_at: 2026-11-14T18:04:40.795814+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/upload.ts

## Purpose

Defines the multer-based file-upload pipeline for image endpoints: where bytes land (a staging directory), how they are renamed (cryptographically random + server-chosen extension), which MIME types are admitted, and what hard limits guard the parser. It also wraps the middleware to restore `AsyncLocalStorage` locale context after multer consumes the request stream, and converts multer errors into the correct HTTP responses (415 / 400) before they reach the central error handler.

## Key elements

- **`uploadStagingPath()`** — returns the staging directory from `uploadConfig().NODE_UPLOAD_STAGING_PATH`; the write target while the request is still being validated (not the public directory).
- **`resolveUploadDestination(request, file, cb)`** — multer `destination` callback; whitelists `fieldname === 'imageUpload'` and `mkdir -p`s the staging dir. Exported so tests can exercise the field-whitelist decision directly.
- **`resolveUploadFilename(request, file, cb)`** — multer `filename` callback; ignores client `originalname`, emits `randomBytes(16).toString('hex')` + extension derived from the declared MIME type (falls back to `.bin`).
- **`fileFilter(request, file, cb)`** — rejects parts whose `mimetype` is not in `ACCEPTED_UPLOAD_MIMETYPES` by raising `UnsupportedUploadTypeError` (answered as 415), never `callback(null, false)`.
- **`maxUploadBytes()`** — returns `uploadConfig().NODE_MAX_UPLOAD_BYTES` (default 5 MB); read at call time so tests can query the live value.
- **`rawUpload()` / `configuredUpload`** — memoised `multer` instance with `diskStorage`, `fileFilter`, and explicit `limits` (`fileSize`, `files: 1`, `fields: 32`, `fieldSize: 100 KB`, `parts: 64`).
- **`withLocaleRestored(middleware)`** — higher-order wrapper that re-enters the request's locale via `runWithLocaleContext` in the `next` callback, preventing silent fallback to the boot language.
- **`answerUploadError(error, response, next)`** — maps `UnsupportedUploadTypeError` → 415, malformed-multipart `Error` → 400 (via `rejectResponse`), anything else → `next(error)`. Runs inside the restored locale so messages are translated.
- **`isMalformedMultipart(error)`** — type guard distinguishing busboy body-parse failures from `MulterError` and OS-level (syscall) errors.
- **`UnsupportedUploadTypeError`** — internal error class that signals "wrong declared type" without leaking into the central handler.

## Relationships

- **`src/infrastructure/http/config.ts`** — `uploadConfig()` supplies `NODE_UPLOAD_STAGING_PATH` and `NODE_MAX_UPLOAD_BYTES`.
- **`src/infrastructure/adapters/image-signatures.ts`** — provides `ACCEPTED_UPLOAD_MIMETYPES` (filter whitelist), `normaliseDeclaredImageMime` + `extensionForImage` (filename extension), and `identifyImageFile` (post-write byte validation used downstream).
- **`src/infrastructure/http/uploads.ts`** — `getFormFiles` / `readUploadedImage` are the read-side counterpart; routes call them after this middleware has written the file.
- **`src/infrastructure/http/response.ts`** — `rejectResponse` is used by `answerUploadError` to emit the 400/415 body.
- **`src/infrastructure/i18n/context.ts`** / **`src/infrastructure/i18n/index.ts`** — `createLocaleContext`, `runWithLocaleContext`, and `t` keep translated error messages working across the multer boundary.
- **`src/infrastructure/adapters/filesystem.ts`** — `deleteFile` is used to clean up staging files on rejection.
- **`src/infrastructure/adapters/image.worker.ts`** — `digestQuarantinedImage` is called after acceptance to hash/validate the stored bytes.
- **`src/infrastructure/adapters/queue.ts`** — `queueState` gates whether async post-processing can proceed.
- **`src/infrastructure/adapters/image-store.ts`** — `imageStore` is imported for post-acceptance storage operations.
- **`src/infrastructure/adapters/logger.ts`** — `logger` is used for error diagnostics.
- **`src/modules/account/routes.ts`**, **`src/modules/example/routes.ts`**, **`src/modules/products/routes.ts`** — the three route files that mount this middleware per-request; they are consumers, not dependencies of this module.

## Notes

- The multer instance is memoised (`configuredUpload`) because `limits` are frozen at construction; building it during module evaluation would capture env values before `.env` is loaded.
- Staging path and public path are deliberately separate: a file is only "stored" after quarantine/validation commits it. `NODE_UPLOAD_STAGING_PATH` overrides the default system-temp location.
- `files: 1` in `limits` is critical — without it a single request could carry thousands of parts, each written to disk.
- The locale wrapper (`withLocaleRestored`) is necessary because multer's internal socket-read resumes in the connection's async context, outside the `AsyncLocalStorage` scope that `attachLocale` established earlier in the chain. Omitting it makes `t()` silently use the boot language.
- `resolveUploadDestination` and `resolveUploadFilename` are exported (not inlined into `multer.diskStorage`) so unit tests can assert their security decisions without spinning up Express.
