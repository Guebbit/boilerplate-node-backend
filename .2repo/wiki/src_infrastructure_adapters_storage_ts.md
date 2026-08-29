# src/infrastructure/adapters/storage.ts

## Purpose

Configures the Multer-based file-upload pipeline for the Express API: where uploads are staged on disk, how files are renamed, which MIME types are admitted, what size limits apply, and how the actual bytes are validated after the write. It produces a ready-to-mount `RequestHandler` (`.single('imageUpload')`, etc.) that every upload route uses, ensuring that untrusted uploads never land in the public directory, never reuse a client-supplied filename, and never bypass locale-aware error messaging.

## Key elements

- **`uploadStagingPath()`** – Returns the temporary staging directory (`NODE_UPLOAD_STAGING_PATH` or `tmpdir()/node-api-uploads`). Files live here only until accepted.
- **`resolveUploadDestination`** – Multer `destination` callback. Whitelists the `imageUpload` form field (rejects anything else) and `mkdir -p`s the staging path.
- **`resolveUploadFilename`** – Multer `filename` callback. Generates a 128-bit random hex name + an extension derived from the *declared* MIME (never the client's `originalname`).
- **`fileStorage`** – The `multer.diskStorage({ destination, filename })` engine.
- **`ACCEPTED_UPLOAD_MIMETYPES`** – Closed `Set` (`image/png`, `image/jpg`, `image/jpeg`, `image/webp`).
- **`fileFilter`** – Multer `fileFilter` callback; first gate that silently drops files whose *declared* MIME is not in the set.
- **`maxUploadBytes()`** – Reads `NODE_MAX_UPLOAD_BYTES` (default 5 MB) via `environmentNumber`; returns the ceiling at call time so late-loaded `.env` files are honoured.
- **`rawUpload()`** (memoised `configuredUpload`) – Builds a single `Multer` instance with `fileStorage`, `fileFilter`, and explicit `limits` (fileSize, files = 1, fields = 32, fieldSize = 100 KB, parts = 64).
- **`withLocaleRestored`** – Wraps any `RequestHandler` so that after Multer consumes the request stream, the `AsyncLocalStorage` locale context is re-entered before `next()` fires. Prevents Zod/`t` from silently falling back to the boot language.
- **`validateUploadedImages`** *(referenced; file truncated before full implementation)* – Second gate that inspects actual file bytes via `identifyImageFile` after Multer has written the file to staging.

## Relationships

- **`src/infrastructure/adapters/image-signatures.ts`** – Provides `extensionForImage`, `identifyImageFile`, and `normaliseDeclaredImageMime`, which this file uses for both filename generation and byte-level content validation.
- **`src/infrastructure/adapters/filesystem.ts`** – Provides `deleteFile`, used to clean up staged files that fail validation.
- **`src/infrastructure/adapters/image-store.ts`** – Provides `imageStore`, the final destination where accepted images are committed after the staging phase.
- **`src/infrastructure/http/errors.ts`** – Provides `ExtendedError` for structured, i18n-aware error responses when uploads are rejected.
- **`src/infrastructure/http/uploads.ts`** – Provides `getFormFiles`, a helper to extract the array of files from `request.files` in downstream handlers.
- **`src/infrastructure/i18n/index.ts`** – Provides `createLocaleContext`, `runWithLocaleContext`, and `t`; consumed by `withLocaleRestored` and (presumably) by validation error messages.
- **`src/infrastructure/adapters/logger.ts`** – Provides `logger` for diagnostic logging during the upload pipeline.
- **`src/infrastructure/runtime/environment.ts`** – Provides `environmentNumber`, the typed env-reader used by `maxUploadBytes()`.
- **`src/modules/account/routes.ts`**, **`src/modules/products/routes.ts`**, **`src/modules/users/routes.ts`** – Route modules that mount the upload middleware (e.g. `upload.single('imageUpload')`) on their respective endpoints.
- **`shared/contracts/openapi.root.yaml`** – OpenAPI contract documenting the upload endpoints this middleware serves.
- **`public/images/seed/README.md`** – Documents the public images directory; staged files are only moved here after successful validation and storage.

## Notes

- **Two-gate model.** `fileFilter` checks the *declared* MIME (cheap, pre-write); `validateUploadedImages` checks the *actual bytes* (post-write). The first cannot inspect content; the second cannot run before Multer writes the file. Both are necessary.
- **Staging ≠ public.** Files written by Multer live in a temp directory. They are unreachable over HTTP until `storeUploadedImages` commits them to the public/image-store location. This is the core security invariant.
- **`image/jpg` is intentionally accepted.** It is not a valid IANA type, but enough real clients send it. The byte check downstream is the authoritative gate.
- **`withLocaleRestored` is required on every upload mount.** Without it, everything after Multer runs outside the `AsyncLocalStorage` scope, and validation messages silently revert to the boot language. The bug was invisible on JSON routes because `express.json()` runs before `attachLocale`.
- **Multer instance is memoised, not per-request.** `limits` are frozen at construction; rebuilding per call would also rebuild the storage engine. The lazy `rawUpload()` pattern ensures `.env` values are read after loading.
- **No `limits` in `fileStorage` itself.** Limits live only on the Multer instance (`rawUpload`). Forgetting to go through `rawUpload` means unlimited upload size.
