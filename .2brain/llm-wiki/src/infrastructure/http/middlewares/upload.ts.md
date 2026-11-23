---
source: src/infrastructure/http/middlewares/upload.ts
source_sha256: 627323183d5f00fd8e18869f9726579a3bf24b61845f1b0fb07aa93f339fd2eb
context_sha256: b307dbdc5d7ca791215a66144c4b874e70c8bed4895bf1d4c890daa6c6d8d7d1
generated_at: 2026-11-22T02:52:47.041652+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/http/middlewares/upload.ts

## Purpose
Multer-based file upload middleware for Express. It defines where uploads are staged, how they are named, which MIME types are accepted, and what size and part limits apply. The resulting `upload` middleware is attached per route. Files are written to a staging directory, not the public one, until a later step commits them. Reading the uploaded image back is handled in `../uploads`, not here.

## Key elements
- `uploadStagingPath()` returns `uploadConfig().NODE_UPLOAD_STAGING_PATH`, the directory where multer writes files while the request is still being decided.
- `resolveUploadDestination` is the multer `destination` callback.
  - It rejects any field other than `imageUpload` with a `MulterError('LIMIT_UNEXPECTED_FILE')`.
  - It creates the staging directory on demand with `mkdir` (recursive).
  - It is exported so tests can exercise the field whitelist.
- `resolveUploadFilename` is the multer `filename` callback.
  - The name is 16 random bytes in hex plus an extension.
  - The extension comes from `extensionForImage(normaliseDeclaredImageMime(file.mimetype))`, falling back to `bin`.
  - The client's `originalname` is never used, which avoids path traversal, collisions, enumeration, and stored XSS via a served extension.
- `fileStorage` is `multer.diskStorage` built from the two callbacks above.
- `UnsupportedUploadTypeError` is an internal error class raised by the filter.
- `fileFilter` is the first gate. It checks the client-declared `mimetype` against `ACCEPTED_UPLOAD_MIMETYPES`.
  - A wrong type produces an error, not `callback(null, false)`, so the sender is told.
  - The bytes are verified after the write by `validateUploadedImages`, which is referenced in the comments.
- `maxUploadBytes()` returns `uploadConfig().NODE_MAX_UPLOAD_BYTES`. It is read at call time.
- `rawUpload()` lazily builds and memoises one shared multer instance, held in `configuredUpload`.
  - It uses `fileStorage` and `fileFilter`.
  - Its limits are `fileSize` from `maxUploadBytes()`, `files: 1`, `fields: 32`, `fieldSize` 100 KiB, and `parts: 64`.
- `withLocaleRestored(middleware)` wraps a multer handler so the request's locale context is restored after multer returns.
  - It calls `runWithLocaleContext(createLocaleContext(request.locale), …)` when `request.locale` is set.
  - It then routes any error through `answerUploadError`, or calls `next()`.
- `isMalformedMultipart(error)` identifies busboy parse failures. These are plain `Error`s that are not `MulterError` and have no `syscall`.
- `answerUploadError` (its body is not shown in the visible portion of the file) is described in its doc comment.
  - It answers `UnsupportedUploadTypeError` with a 415 that lists the accepted types in `details.accepted`.
  - It answers a malformed multipart body with a 400 client error.
  - It passes everything else to the central error handler.
  - It runs inside the restored locale context, so messages are translated.

## Relationships
- **`src/infrastructure/http/config.ts` (`uploadConfig`)** supplies the staging path and the max upload size.
- **`src/infrastructure/adapters/image-signatures.ts`** supplies `ACCEPTED_UPLOAD_MIMETYPES`, `extensionForImage`, `normaliseDeclaredImageMime` and `identifyImageFile`.
- **`src/infrastructure/i18n/index.ts` and `src/infrastructure/i18n/context.ts` (`createLocaleContext`, `runWithLocaleContext`, `t`)** restore the locale after multer and translate error messages.
- **`src/infrastructure/http/response.ts` (`rejectResponse`)** is imported, presumably to build error responses.
- **`src/infrastructure/adapters/filesystem.ts` (`deleteFile`), `src/infrastructure/adapters/image-store.ts`, `src/infrastructure/adapters/image.worker.ts` (`digestQuarantinedImage`), `src/infrastructure/adapters/queue.ts` (`queueState`), `src/infrastructure/http/uploads.ts` (`getFormFiles`, `readUploadedImage`) and `src/infrastructure/adapters/logger.ts`** are all imported. The visible portion of the file does not show them being used. Comments refer to `quarantineUploadedImages` and `validateUploadedImages`, which are presumably defined later in the file.
- **`@api/error-codes` and `@api/upload-types`** are also imported (`ERROR_CODES`, `ACCEPTED_UPLOAD_TYPES`).
- **`src/modules/account/routes.ts`, `src/modules/example/routes.ts` and `src/modules/products/routes.ts`** are the graph neighbours that mount this middleware per route.

## Notes
- The staging directory is deliberately not `public/`. Nothing becomes reachable until the quarantine step commits it.
- The multer instance is built lazily because its `limits` are frozen at construction and `.env` may not have loaded at module evaluation.
- Multer consumes the request stream, so the `AsyncLocalStorage` locale context would otherwise be lost. `withLocaleRestored` fixes this centrally, so route mounts cannot forget it.
- `file.mimetype` is client-supplied. `fileFilter` is only a cheap first check, and content verification happens after the write.
- `files: 1` means only a single file part per request is accepted.
