# src/infrastructure/adapters/filesystem.ts

## Purpose

Small, dependency-light module that centralises two low-level filesystem operations every disk-touching adapter needs: a cross-mount `moveFile` (with an EXDEV fallback) and a non-throwing `deleteFile` (log-and-swallow). Existing so no other adapter re-derives either pattern on its own.

## Key elements

- **`moveFile(source, destination)`** (exported, async) — Attempts an atomic `rename()`. If it fails with `EXDEV` (the common case: upload staging on tmpfs vs. a mounted volume), falls back to `copyFile` → `unlink`. **Throws** on any other error or on a failed fallback, because a failed move means the bytes the client sent are not where the database expects them.
- **`deleteFile(filePath)`** (exported, sync) — Delegates to `@guebbit/js-toolkit`'s `deleteFile` with an error callback. **Never throws**; unexpected failures are logged at `error` level through the shared logger. Intended for cleanup of multer uploads after a failed validation.
- **Imports** — `node:fs/promises` (`copyFile`, `rename`, `unlink`), `@guebbit/js-toolkit` (`deleteFile`), `@infrastructure/adapters/logger` (`logger`).

## Relationships

- **`src/infrastructure/adapters/logger.ts`** — Imported; its `logger` is the sole error sink inside `deleteFile`'s callback.
- **`src/infrastructure/adapters/image-store.ts`** / **`src/infrastructure/adapters/storage.ts`** — Graph neighbours listed as consumers; the module doc states "every other adapter that touches disk builds on these two," indicating they call `moveFile` and/or `deleteFile` rather than re-implementing the fallbacks.

## Notes

- **Order matters in the EXDEV fallback:** `copyFile` before `unlink` ensures a crash between the two leaves a *stale staged file* (recoverable) rather than losing the upload entirely.
- **Error object in `deleteFile`:** The error is passed as a nested `error` property, *not* spread into its own fields. This keeps `redactFormat` / `serializeError` as the single gate deciding whether stack traces (and container paths) reach production logs.
- **eslint-disable on the `try/catch` in `moveFile` is intentional** — the catch block *is* the cross-mount fallback, not a generic error swallow.
- **`moveFile` destination directory must already exist**; the function does not create intermediate paths.
