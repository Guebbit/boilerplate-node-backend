---
source: src/infrastructure/http/middlewares/upload.ts
sha256: c67d818ff2576e0775cbf764e2b8f20b7131297df20766b1678ca62d7fe41fdb
generated_at: 2026-09-27T14:10:37.402430+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/upload.ts

## Purpose
Defines the complete multer-based image-upload pipeline: staging directory, random filename generation, MIME-type filtering (both declared and byte-level), size limits, and post-write validation. It is the *write* side of image uploads; the read side (`readUploadedImage`) lives in `../uploads`. Mounted per-route by the account, products, and users modules.

## Key elements

- **`uploadStagingPath()`** — Returns the temp staging directory (`NODE_UPLOAD_STAGING_PATH` or `tmpdir()/node-api-uploads`). Files land here *before* acceptance; never directly in a public path.
- **`resolveUploadDestination`** — Multer destination callback. Whitelists `file.fieldname` against the single constant `IMAGE_UPLOAD_FIELD` (`'imageUpload'`); rejects unknown fields. Creates the staging dir on demand.
- **`resolveUploadFilename`** — Multer filename callback. Generates `randomBytes(16).toString('hex')` + a safe extension derived from the *declared* MIME. Never reuses the client-supplied `originalname`.
- **`fileStorage`** — The `multer.diskStorage` instance wiring the two callbacks above.
- **`fileFilter`** — First gate (pre-write). Checks the client-declared `mimetype` against `ACCEPTED_UPLOAD_MIMETYPES`. Silently drops the file (`callback(null, false)`); the request still succeeds with no `request.file`.
- **`maxUploadBytes()`** — Reads `NODE_MAX_UPLOAD_BYTES` at call time (default 5 MB). Called lazily so `.env` loading is respected.
- **`rawUpload()` / `configuredUpload`** — Memoised `multer` instance with `limits` (fileSize, files: 1, fields: 32, fieldSize: 100 KB, parts: 64). Built once because multer freezes limits at construction.
- **`withLocaleRestored`** — Wraps a RequestHandler so `AsyncLocalStorage` locale context survives multer's stream consumption (which breaks `AsyncLocalStorage` propagation through `EventEmitter` listeners).
- **`validateUploadedImages`** — Second gate (post-write). Reads the staged file bytes, calls `identifyImageFile` to confirm the actual format matches the declared MIME. On mismatch: deletes the file and responds 422 via `rejectResponse`.
- **`quarantineUploadedImages`** (referenced in comments) — Commits an accepted file from staging to its final store (`imageStore`) and triggers `digestQuarantinedImage` in the worker. Makes "written" and "stored" two distinct moments, enabling a remote-bucket backend.

## Relationships

- **`src/infrastructure/adapters/image-signatures.ts`** — Source of `ACCEPTED_UPLOAD_MIMETYPES`, `extensionForImage`, `identifyImageFile`, and `normaliseDeclaredImageMime`; the only authority on what formats are legal.
- **`src/infrastructure/adapters/filesystem.ts`** — Provides `deleteFile`, used to clean up rejected uploads from staging.
- **`src/infrastructure/adapters/image-store.ts`** — `imageStore` is the final destination for accepted files (abstracts local vs. remote bucket).
- **`src/infrastructure/adapters/image.worker.ts`** — `digestQuarantinedImage` is called during quarantine to process the image in a worker thread.
- **`src/infrastructure/adapters/queue.ts`** — `queueState` is consulted (likely to gate whether the worker pipeline is ready before accepting an upload).
- **`src/infrastructure/http/uploads.ts`** — `getFormFiles` extracts the list of staged file paths from `request.files` after multer has run.
- **`src/infrastructure/http/response.ts`** — `rejectResponse` sends the 422 on byte-level validation failure.
- **`src/infrastructure/i18n/context.ts` / `i18n/index.ts`** — `createLocaleContext`, `runWithLocaleContext`, `t` are used by `withLocaleRestored` and for user-facing error strings.
- **`src/infrastructure/runtime/environment.ts`** — `environmentNumber` reads `NODE_MAX_UPLOAD_BYTES` from the process environment.
- **`src/infrastructure/adapters/logger.ts`** — `logger` for structured logging of upload events/errors.
- **`src/modules/account/routes.ts`, `src/modules/products/routes.ts`, `src/modules/users/routes.ts`** — The three route files that mount the `rawUpload()` middleware (wrapped with `withLocaleRestored`) and then chain `validateUploadedImages` / `quarantineUploadedImages`.
- **`shared/contracts/openapi.root.yaml`** — Documents the multipart upload endpoints (field name, size limits, accepted types) that this middleware enforces.

## Notes

- **Two-gate design:** `fileFilter` (header-based, silent drop) runs *before* the file touches disk; `validateUploadedImages` (byte-based, 422 response) runs *after*. The former prevents useless I/O; the latter prevents format spoofing.
- **Staging ≠ public:** Files in the staging directory are not web-served. They only become publicly reachable after `quarantineUploadedImages` moves them to `imageStore`. This gap is what allows a remote S3-compatible bucket as the final store.
- **Locale fix is structural:** `withLocaleRestored` exists because multer's internal stream reading breaks `AsyncLocalStorage` propagation. Without it, every handler after the upload runs in the boot-language context. Routes that forget the wrapper fail silently in non-default locales.
- **`fileFilter` is intentionally silent:** It calls `callback(null, false)` (no error) so the request "succeeds" with zero files, rather than throwing into the central error handler. `validateUploadedImages` is the opposite — it writes a direct 422. Don't "fix" one to match the other.
- **Multer is memoised:** `configuredUpload` is assigned once. Because `limits` are frozen at `multer()` construction, reading `maxUploadBytes()` lazily only helps if the first request (and thus first `rawUpload()` call) happens *after* `.env` is loaded. A test that sets the env var and then imports the module for the first time will see the correct value.
