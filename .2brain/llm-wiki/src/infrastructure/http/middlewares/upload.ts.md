---
source: src/infrastructure/http/middlewares/upload.ts
sha256: 9c77856bb3e62b4137638d599cad79be05fb8c87d8983471a3d821fe12b49381
generated_at: 2026-10-14T07:59:05.756683+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/upload.ts

## Purpose

Defines the multer-based file-upload pipeline: where uploads land (staging dir), how they are named (128-bit random hex), which MIME types are accepted, and size/count limits. Exports both the raw multer middleware and a post-write validation middleware that confirms the file's actual bytes match the declared type. Files live in a non-public staging directory until a downstream quarantine step commits them.

## Key elements

- **`uploadStagingPath()`** — Returns the staging directory from `uploadConfig().NODE_UPLOAD_STAGING_PATH`. Not the public directory; files here are not yet reachable by clients.
- **`resolveUploadDestination`** — Multer `destination` callback. Rejects any field name other than `'imageUpload'` (whitelist), creates the staging dir on demand, passes the path to multer.
- **`resolveUploadFilename`** — Multer `filename` callback. Generates `randomBytes(16).toString('hex')` + a safe extension derived from the declared MIME. Never uses the client-supplied `originalname`.
- **`fileStorage`** — `multer.diskStorage` instance combining the two callbacks above.
- **`fileFilter`** — Pre-write gate. Silently drops the file (`callback(null, false)`) if the declared MIME is not in `ACCEPTED_UPLOAD_MIMETYPES`. Runs before the file touches disk.
- **`maxUploadBytes()`** — Returns `uploadConfig().NODE_MAX_UPLOAD_BYTES` (default 5 MB). Read at call time for testability.
- **`rawUpload()`** — Memoised (`configuredUpload`) factory that returns the single shared `Multer` instance with `fileStorage`, `fileFilter`, and explicit `limits` (`fileSize`, `files: 1`, `fields: 32`, `fieldSize: 100 KiB`, `parts: 64`).
- **`withLocaleRestored`** — Internal wrapper around any `RequestHandler` that re-establishes the i18n `AsyncLocalStorage` context after multer's stream consumption breaks it.
- **`validateUploadedImages`** — Post-write middleware. Reads each staged file, calls `identifyImageFile` to verify the magic bytes match the declared MIME (and are a recognised image). Deletes the file and responds 422 on mismatch; calls `next()` on success.

## Relationships

- **`@infrastructure/http/config`** — Source of `NODE_UPLOAD_STAGING_PATH` and `NODE_MAX_UPLOAD_BYTES`.
- **`@infrastructure/adapters/image-signatures`** — Provides `ACCEPTED_UPLOAD_MIMETYPES`, `extensionForImage`, `identifyImageFile`, `normaliseDeclaredImageMime` used by both the pre- and post-write gates.
- **`@infrastructure/adapters/filesystem`** — `deleteFile` is called to remove quarantined/rejected files from staging.
- **`@infrastructure/http/uploads`** — `getFormFiles` extracts staged file paths; `readUploadedImage` is the read-side counterpart (lives there, not here).
- **`@infrastructure/adapters/image-store` / `image.worker` / `queue`** — Downstream consumers that pick up staged files after this middleware's validation passes (quarantine, digest, enqueue).
- **`@infrastructure/i18n`** — `createLocaleContext` / `runWithLocaleContext` used by `withLocaleRestored` to survive the stream-consumption boundary.
- **`@infrastructure/http/response`** — `rejectResponse` used when `validateUploadedImages` returns 422.
- **`src/modules/account/routes.ts`, `src/modules/example/routes.ts`** — Route modules that attach the upload middleware per-route.
- **`shared/contracts/openapi.root.yaml`** — API contract describing the upload endpoints this middleware serves.

## Notes

- **Memoisation is load-bearing.** `rawUpload()` caches the `Multer` instance because `limits` are frozen at construction. Calling it before `.env` is loaded would bake in wrong values; the lazy-init pattern avoids that.
- **Two-gate validation is intentional.** `fileFilter` checks the *declared* MIME before the write (cheap rejection). `validateUploadedImages` checks the *actual* bytes after the write. Neither is sufficient alone.
- **Locale context breaks after multer.** Multer consumes the request stream via a socket-read callback whose async context is the connection's, not the route handler's. `withLocaleRestored` must wrap the middleware at the mount site; forgetting it causes silent i18n fallback.
- **Staging ≠ public.** Files in the staging directory are not served by any static handler. They only become reachable after the quarantine/store step moves them. Do not point a static server at this directory.
- **Multer's default `fileSize` is unlimited.** The explicit `limits.fileSize` here is a DoS guard, not an optimisation.
