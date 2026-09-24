---
source: src/infrastructure/http/middlewares/upload.ts
sha256: 6f1454002243224c539ccb7b8286a909a5f4b31c12c7aca3be43f229d4d73e40
generated_at: 2026-09-23T17:45:12.949053+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/upload.ts

## Purpose

Defines the Express multer middleware pipeline for accepting, storing, and validating image uploads. It controls where files are written (a staging directory, never `public/`), how they are named (cryptographically random hex), which MIME types are accepted (declared type), and whether the actual bytes match the declaration. The read-back path (`readUploadedImage`) lives separately in `../uploads`.

## Key elements

- **`uploadStagingPath()`** — Returns the staging directory (`NODE_UPLOAD_STAGING_PATH` or `<tmpdir>/node-api-uploads`). Files live here until a later step commits them to the public store.
- **`resolveUploadDestination(request, file, callback)`** — Multer destination callback. Whitelists `fieldname === 'imageUpload'`; rejects all others. Creates the staging dir on demand.
- **`resolveUploadFilename(request, file, callback)`** — Multer filename callback. Generates a 128-bit `randomBytes` hex name + extension derived from the *declared* MIME (never the client's `originalname`).
- **`fileStorage`** — `multer.diskStorage` instance wiring the two callbacks above.
- **`fileFilter`** — First gate (pre-write). Checks `file.mimetype` against `ACCEPTED_UPLOAD_MIMETYPES`. Silently drops non-matches via `callback(null, false)`.
- **`maxUploadBytes()`** — Reads `NODE_MAX_UPLOAD_BYTES` (default 5 MiB) at call time so lazy `.env` loading is respected.
- **`rawUpload()`** — Memoises the shared `Multer` instance (limits: 1 file, ≤32 fields, 100 KiB/field, 64 parts). Exported indirectly via the configured instance.
- **`withLocaleRestored(middleware)`** — Wraps any `RequestHandler` so the `AsyncLocalStorage` locale set before the upload survives multer's stream consumption (which resets the async context to the socket).
- **`validateUploadedImages`** — Second gate (post-write). Calls `identifyImageFile` on each staged path; if bytes don't match the declared MIME, deletes the file and responds **422**.

## Relationships

- **`src/infrastructure/adapters/image-signatures.ts`** — Source of `ACCEPTED_UPLOAD_MIMETYPES`, `extensionForImage`, `identifyImageFile`, and `normaliseDeclaredImageMime`; all type-identification logic lives there.
- **`src/infrastructure/adapters/filesystem.ts`** — `deleteFile` is called to remove rejected files from staging.
- **`src/infrastructure/adapters/image-store.ts`** / **`image.worker.ts`** — Imported for the downstream quarantine/digest step that commits a validated file from staging to the permanent store.
- **`src/infrastructure/http/uploads.ts`** — `getFormFiles` extracts the list of staged file paths from the (already multer-processed) request.
- **`src/infrastructure/http/response.ts`** — `rejectResponse` formats the 422 body for validation failures.
- **`src/infrastructure/i18n/index.ts` / `context.ts`** — `createLocaleContext` and `runWithLocaleContext` re-establish the locale scope after multer's stream handler breaks `AsyncLocalStorage` propagation.
- **`src/infrastructure/runtime/environment.ts`** — `environmentNumber` reads `NODE_MAX_UPLOAD_BYTES` with a safe minimum.
- **`src/infrastructure/adapters/queue.ts`** — `queueState` imported (likely guards whether image processing can be enqueued post-upload).
- **`src/infrastructure/adapters/logger.ts`** — `logger` records rejection details for audit.
- **`src/modules/account/routes.ts`**, **`src/modules/products/routes.ts`**, **`src/modules/users/routes.ts`** — Route modules that mount the upload middleware on their respective image-upload endpoints.
- **`shared/contracts/openapi.root.yaml`** — OpenAPI spec documents the upload endpoint's `multipart/form-data` schema and the `imageUpload` field name.

## Notes

- **Two distinct rejection styles.** `fileFilter` silently drops the file (`callback(null, false)`); `validateUploadedImages` responds 422. This is intentional: the first is a pre-write type gate the client may not notice, the second is a post-write integrity failure the client must know about.
- **Memoised multer instance.** `rawUpload()` is lazy to avoid freezing `limits` before `.env` is loaded. There is exactly one instance per process.
- **Locale wrapper is mandatory.** Any route that mounts the upload middleware *must* wrap it with `withLocaleRestored`, otherwise all downstream i18n `t()` calls fall back to the boot language. The wrapper exists here so the failure mode is centralised, not per-route.
- **Staging ≠ public.** Files in the staging path are unguessable (random hex) and in a non-served directory, but they are not *protected* by access control—rejection relies on the 422 response deleting them promptly.
- **Extension is security-relevant.** The stored extension determines the `Content-Type` a static server sends. A mismatch between declared MIME and actual bytes (e.g. JPEG bytes in a `.png` file) is rejected to prevent stored-XSS vectors via MIME confusion.
