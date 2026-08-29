# src/infrastructure/adapters/filesystem.ts

## Purpose

Low-level filesystem helpers (`moveFile`, `deleteFile`) used to relocate and clean up upload files. They exist as a thin adapter layer so callers don't repeat `rename`/`EXDEV` fallback logic or ad-hoc error-swallowing patterns.

## Key elements

- **`moveFile(source, destination)`** — Moves a file. Tries atomic `rename` first; on `EXDEV` (cross-device) falls back to `copyFile` + `unlink`. **Throws** on any non-EXDEV error or if the copy/unlink fail, because a failed move means the uploaded bytes are missing.
- **`deleteFile(filePath)`** — Deletes a file. Delegates to `@guebbit/js-toolkit`'s `deleteFile` with an error callback. **Never throws**; on failure it calls `logger.error({ message, error })`. Intended for post-validation cleanup of multer-staged uploads.
- Imports `copyFile`, `rename`, `unlink` from `node:fs/promises`; imports `deleteFile` from `@guebbit/js-toolkit` (aliased to avoid collision); imports `logger` from the local logger adapter.

## Relationships

- **`src/infrastructure/adapters/logger.ts`** — `deleteFile` calls `logger.error` to report failed deletions. The error object is passed under the `error` key to stay within the `redactFormat`/`serializeError` contract.
- **`src/infrastructure/adapters/storage.ts`** / **`src/infrastructure/adapters/image-store.ts`** — Consumers of these helpers for persisting or cleaning up uploaded files (images, generic uploads) in the public directory.

## Notes

- The `EXDEV` fallback is **the common production path**, not an edge case: uploads land in `/tmp` (tmpfs) while the public dir is on disk or a mounted volume. The `rename` fast path is mainly exercised in tests.
- Copy-then-unlink ordering in the fallback is deliberate: a crash mid-sequence leaves a stale staged file (recoverable by the next `deleteFile` call); the reverse order would lose the upload.
- `deleteFile` is at `logger.error` level (not `warn`) because a persistent delete failure usually signals a permissions or mount misconfiguration.
- The error object is passed whole under the `error` key; do **not** spread its properties (e.g. `stack`) into the log payload, as that bypasses `serializeError` and leaks absolute container paths into production logs.
- `moveFile` requires the destination **directory** to already exist; it does not create directories.
