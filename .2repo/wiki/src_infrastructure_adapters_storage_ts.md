# src/infrastructure/adapters/storage.ts

## Purpose

Configures the multer file-upload pipeline for the Express API: defines the staging destination, generates safe filenames, enforces MIME-type and size limits, and provides a post-write byte-level validation middleware. It is mounted per-route by the modules that accept image uploads.

## Key elements

- **`uploadStagingPath()`** — Returns the temporary staging directory (`$NODE_UPLOAD_STAGING_PATH` or `tmpdir()/node-api-uploads`). Files live here *before* acceptance; this is not the public directory.
- **`resolveUploadDestination(req, file, cb)`** — Multer `destination` callback. Whitelists `fieldname === 'imageUpload'` and creates the staging dir on demand.
- **`resolveUploadFilename(req, file, cb)`** — Multer `filename` callback. Generates a 128-bit random hex name + extension derived from the declared MIME (never from `originalname`).
- **`fileStorage`** — `multer.diskStorage` instance wiring the two callbacks above.
- **`fileFilter`** — First gate (pre-write). Accepts only MIME types in `ACCEPTED_UPLOAD_MIMETYPES`; silently drops others via `callback(null, false)`.
- **`maxUploadBytes()`** — Returns the per-file size ceiling from `NODE_MAX_UPLOAD_BYTES` (default 5 MiB).
- **`rawUpload()`** — Lazily builds and memoises the single process-wide `Multer` instance, applying `fileStorage`, `fileFilter`, and tight `limits` (1 file, 32 fields, 64 parts, 100 KiB per field).
- **`withLocaleRestored(mw)`** — Wraps any `RequestHandler` so that the i18n `AsyncLocalStorage` context survives multer's stream consumption.
- **`validateUploadedImages`** — Second gate (post-write). Reads the staged file(s) via `identifyImageFile`, confirms the bytes match the declared MIME, deletes and rejects with `ExtendedError` (422) on mismatch, and optionally enqueues a quarantine digest worker.

## Relationships

- **`image-signatures.ts`** — Supplies `ACCEPTED_UPLOAD_MIMETYPES`, `extensionForImage`, `identifyImageFile`, and `normaliseDeclaredImageMime` used by the filter, filename resolver, and byte-validation middleware.
- **`filesystem.ts`** — `deleteFile` is called to remove rejected files from staging.
- **`image-store.ts`** — `imageStore` is referenced for the commit/quarantine step after validation passes.
- **`image.worker.ts`** — `digestQuarantinedImage` is invoked (when the queue is enabled) to process rejected images off-thread.
- **`queue.ts`** — `isQueueEnabled` gates whether quarantine work goes through the job queue or runs inline.
- **`http/uploads.ts`** — `getFormFiles` extracts the staged file paths from the request for validation.
- **`http/errors.ts`** — `ExtendedError` is the rejection type thrown when byte validation fails.
- **`logger.ts`** — `logger.warn` records declared-type vs. actual-type mismatches.
- **`runtime/environment.ts`** — `environmentNumber` safely reads `NODE_MAX_UPLOAD_BYTES`.
- **`i18n/context.ts` / `i18n/index.ts`** — `createLocaleContext`, `runWithLocaleContext`, and `t` are used inside `withLocaleRestored` to re-establish the locale scope after multer resets the async context.
- **`modules/products/routes.ts`, `modules/account/routes.ts`, `modules/users/routes.ts`** — Route handlers that mount the resulting `upload.single('imageUpload')` (or equivalent) middleware before their controllers.
- **`shared/contracts/openapi.root.yaml`** — Defines the upload endpoint schemas (field name, accepted content types) that this adapter enforces at runtime.

## Notes

- **Two-phase type check is intentional.** `fileFilter` sees only the client-declared MIME (pre-write, silent drop); `validateUploadedImages` inspects actual magic bytes (post-write, explicit 422). Do not collapse them — the extension stored on disk is derived from the *declared* type, so a mismatch means a wrong `Content-Type` would be served.
- **Locale context breaks without `withLocaleRestored`.** Multer resumes the chain from a socket-read callback outside the `AsyncLocalStorage` scope. Any new upload route must wrap its multer middleware with this helper or i18n `t()` will silently fall back to the boot language.
- **`rawUpload()` is memoised** because multer's `limits` are frozen at construction. Reading env vars at module-evaluation time (before `.env` is loaded) would bake in wrong values.
- **Staging ≠ storage.** Files in `uploadStagingPath()` are world-readable only if the app serves that directory — it does not. The commit to the real image store (`imageStore`) is a separate step that happens after validation and DB writes.
- **The field whitelist is a security decision, not a convenience.** `resolveUploadDestination` rejects any field name other than `imageUpload`; adding a new upload field requires updating this check *and* the relevant route.
