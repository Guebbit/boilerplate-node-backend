---
source: src/infrastructure/http/middlewares/upload.ts
sha256: 586b00a24055cd62592376ccc4f893bde3cddb07b6f64472c375734d77de754a
generated_at: 2026-10-29T02:04:35.378184+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/upload.ts

## Purpose

Defines the multer-based image-upload middleware pipeline: where files are staged, how they are named, which MIME types are accepted, and the size/part ceilings enforced. It is the **write side** of image uploads (staging, validation, quarantine); the read side (`readUploadedImage`) lives in `../uploads`. Built as per-route middleware rather than a global adapter because it is route-scoped.

## Key elements

- **`uploadStagingPath()`** – Returns the staging directory (from `uploadConfig().NODE_UPLOAD_STAGING_PATH`). Files land here, *not* in `public/`, until quarantine commits them.
- **`resolveUploadDestination`** – Multer `destination` callback. Whitelists the `imageUpload` field name; creates the staging dir on demand.
- **`resolveUploadFilename`** – Multer `filename` callback. Generates a 128-bit random hex name + extension derived from the declared MIME. Never uses the client's `originalname`.
- **`fileFilter`** – Multer `fileFilter` callback. Rejects any part whose declared MIME is not in `ACCEPTED_UPLOAD_MIMETYPES` by throwing `UnsupportedUploadTypeError` (answered as 415).
- **`maxUploadBytes()`** – Returns the per-file byte ceiling from config (default 5 MB).
- **`rawUpload()`** – Memoised, lazy-built `Multer` instance wiring storage, filter, and `limits` (`fileSize`, `files: 1`, `fields: 32`, `fieldSize`, `parts: 64`).
- **`withLocaleRestored`** – HOC that re-enters the i18n `AsyncLocalStorage` context after multer consumes the request stream (which otherwise drops it).
- **`refuseUnsupportedType`** – Translates `UnsupportedUploadTypeError` into a 415 JSON response listing accepted types; passes other errors to `next`.
- **`validateUploadedImages`** *(truncated)* – Second gate: inspects actual file bytes via `identifyImageFile`; deletes and rejects (422) any file whose signature doesn't match.
- **`UnsupportedUploadTypeError`** – Sentinel class distinguishing type-rejection from generic failures.

## Relationships

- **`adapters/filesystem.ts`** – Calls `deleteFile` to remove rejected uploads from staging.
- **`adapters/image-signatures.ts`** – Imports `ACCEPTED_UPLOAD_MIMETYPES`, `extensionForImage`, `identifyImageFile`, `normaliseDeclaredImageMime` for both gates.
- **`adapters/image-store.ts`** – Uses `imageStore` to commit (quarantine) a validated file to its final destination.
- **`adapters/image.worker.ts`** – Calls `digestQuarantinedImage` post-commit.
- **`adapters/queue.ts`** – References `queueState` (likely to gate processing behind queue readiness).
- **`adapters/logger.ts`** – Logs upload lifecycle events / errors.
- **`http/config.ts`** – Reads `uploadConfig()` for staging path and max-byte limit.
- **`http/response.ts`** – Uses `rejectResponse` to emit structured 415 / 422 error bodies.
- **`http/uploads.ts`** – Imports `getFormFiles` and `readUploadedImage` (the read-side counterpart).
- **`i18n/context.ts` / `i18n/index.ts`** – Uses `createLocaleContext`, `runWithLocaleContext`, and `t` so error messages are locale-aware after multer breaks the async chain.
- **`modules/account/routes.ts` / `modules/example/routes.ts`** – Mount points that attach the upload middleware to their image-upload endpoints.
- **`shared/contracts/openapi.root.yaml`** – The 415 (`UNSUPPORTED_MEDIA_TYPE`) and 422 responses mirror the error schemas declared in the OpenAPI spec.

## Notes

- **Two-gate type check:** `fileFilter` validates the *declared* MIME before the file touches disk; `validateUploadedImages` validates the *actual* bytes after the write. A file can pass one gate and fail the other.
- **Staging ≠ storage:** Files in the staging path are unguessable (random name) and not served by the app. `quarantineUploadedImages` moves them to the real store (possibly remote) as a separate, idempotent step.
- **Never trust `originalname`:** The stored filename is purely random + a server-determined extension. This prevents path traversal, collision overwrites, and stored-XSS via extension spoofing.
- **Memoised multer instance:** `limits` are frozen at construction, so the instance is built lazily on first call to avoid reading config before `.env` loads. Rebuilding per request would also rebuild the storage engine for no benefit.
- **Locale restoration is mandatory:** Multer's stream handling moves the continuation into a socket-read callback outside the `AsyncLocalStorage` scope. `withLocaleRestored` re-enters the context; forgetting it causes silent fallback to the boot language for everything downstream.
- **Field whitelist is intentional:** Only the `imageUpload` field is accepted. An unknown field name is rejected outright rather than dumped into a shared location.
