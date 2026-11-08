---
source: src/infrastructure/http/middlewares/upload.ts
sha256: 9db37c89e6235203dc2fc83a55f4e293e3431f5c28baf49a908c29d98110be15
generated_at: 2026-11-08T03:33:24.934224+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/upload.ts

## Purpose

Defines the per-route multer upload middleware: where files land (a non-public staging directory), what they're renamed to (128-bit random hex + derived extension), which declared MIME types are accepted, and the post-write byte-level type verification. It is middleware (request-scoped, attached per route), not an adapter — the read side (`readUploadedImage`) lives in `../uploads`.

## Key elements

- **`uploadStagingPath()`** — Returns the staging directory from `uploadConfig().NODE_UPLOAD_STAGING_PATH`. Files written here are not publicly fetchable.
- **`IMAGE_UPLOAD_FIELD`** — The single accepted form field name (`'imageUpload'`); all upload routes share this literal.
- **`resolveUploadDestination(req, file, cb)`** — Multer `destination` callback. Rejects any field name other than `IMAGE_UPLOAD_FIELD` (whitelist). Creates the staging dir with `mkdir(recursive)` on demand.
- **`resolveUploadFilename(req, file, cb)`** — Multer `filename` callback. Generates `randomBytes(16).hex` + extension derived from the declared MIME (never the client-supplied `originalname` or its extension).
- **`fileStorage`** — `multer.diskStorage` instance binding the two callbacks above.
- **`fileFilter(req, file, cb)`** — Pre-write gate: checks `file.mimetype` against `ACCEPTED_UPLOAD_MIMETYPES`. Rejects with `UnsupportedUploadTypeError` (surfaced as 415), never silently drops.
- **`UnsupportedUploadTypeError`** — Internal error class caught by `refuseUnsupportedType` to produce the 415 response.
- **`maxUploadBytes()`** — Returns `uploadConfig().NODE_MAX_UPLOAD_BYTES` (default 5 MB).
- **`rawUpload()`** (memoized as `configuredUpload`) — The shared `multer` instance. Configures `storage`, `fileFilter`, and hard limits (`fileSize`, `files: 1`, `fields: 32`, `fieldSize: 100 KB`, `parts: 64`). Memoised because multer freezes `limits` at construction time (lazy-env pattern).
- **`withLocaleRestored(middleware)`** — HOF that wraps the multer middleware so `AsyncLocalStorage` locale context is re-established after multer consumes the request stream (otherwise post-upload code silently falls back to the boot language).
- **`refuseUnsupportedType(error, res, next)`** — Converts `UnsupportedUploadTypeError` into a 415 `rejectResponse` with translated message and accepted-type list; forwards all other errors to the central handler.
- **`validateUploadedImages`** (referenced, truncated) — Post-write gate: verifies actual file bytes via `identifyImageFile`; deletes the file and rejects (422) on mismatch.
- **`quarantineUploadedImages`** (referenced) — Commits accepted files from staging to permanent storage (`imageStore` / remote bucket).

## Relationships

- **`@infrastructure/adapters/image-signatures`** — Provides `ACCEPTED_UPLOAD_MIMETYPES`, `extensionForImage`, `identifyImageFile`, `normaliseDeclaredImageMime` for both type gates.
- **`@infrastructure/adapters/filesystem`** — `deleteFile` removes rejected uploads from staging.
- **`@infrastructure/adapters/image-store`** — `imageStore` is the target for committing accepted images out of staging.
- **`@infrastructure/adapters/image.worker`** — `digestQuarantinedImage` runs after quarantine.
- **`@infrastructure/adapters/queue`** — `queueState` is referenced (likely for async processing coordination).
- **`@infrastructure/adapters/logger`** — `logger` for operational logging.
- **`@infrastructure/http/config`** — `uploadConfig` supplies the staging path and max-bytes limits at call time.
- **`@infrastructure/http/response`** — `rejectResponse` formats the 415/422 error bodies.
- **`@infrastructure/http/uploads`** — `getFormFiles`, `readUploadedImage` are the read-side counterparts consumed by downstream handlers.
- **`@infrastructure/i18n`** — `createLocaleContext`, `runWithLocaleContext`, `t` keep translated error messages working across the multer boundary.
- **`src/modules/account/routes.ts`, `src/modules/products/routes.ts`, `src/modules/example/routes.ts`** — Mount the export of this file as route-level middleware for their respective image-upload endpoints.

## Notes

- **Two-gate type check.** `fileFilter` (pre-write, header only) and `validateUploadedImages` (post-write, byte sniff) are distinct. A request can pass the first and still fail the second.
- **Staging ≠ public.** Files exist in the staging directory from the moment multer writes them until quarantine commits them. The staging path is deliberately not under `public/`.
- **Locale context is fragile across multer.** Multer resumes the chain from a socket-read callback that is *not* an async resource inside the `AsyncLocalStorage` scope. `withLocaleRestored` must wrap every mount; forgetting it is a silent failure that only surfaces in non-default locales.
- **Memoisation is mandatory.** Because `limits` are frozen at `multer()` construction, reading config during module evaluation would lock in values before `.env` loads. The lazy `??=` pattern avoids this.
- **Single-file cap.** `limits.files` is set to 1 — the routes accept exactly one image. The other limits (`fields`, `fieldSize`, `parts`) are DoS guards against parser-time exhaustion.
- **`image/jpg`** appears in `ACCEPTED_UPLOAD_MIMETYPES` despite not being a valid IANA type, because some clients send it.
