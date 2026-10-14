---
source: src/infrastructure/adapters/filesystem.ts
sha256: cc76d785d02782905c4981f70306761ff2e026a1d15458975cb06eb46af06aa7
generated_at: 2026-10-14T07:43:48.086228+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/filesystem.ts

## Purpose

Low-level, dependency-light filesystem helpers (cross-mount move, safe delete, age-based and reference-based directory sweeps) that every other disk-touching adapter builds on, so none of them re-implement the `EXDEV` fallback, the log-and-swallow delete, or the `readdir`/`stat`/`unlink` sweep individually.

## Key elements

- **`moveFile(source, destination)`** — Moves a file via `rename`; on `EXDEV` (different mount) falls back to `copyFile` + `unlink`. Throws on genuine failure — a failed move means uploaded bytes are not where the DB expects them.
- **`deleteFile(filePath)`** — Deletes via `@guebbit/js-toolkit`'s `deleteFile` with an error callback that routes to `logger.error`. Never throws; designed for post-multer-upload cleanup where a failed delete must not turn into a 500.
- **`unlinkIfPresent(filePath, message, fields)`** — Deletes a file; treats `ENOENT` as a silent success (returns `false`). Logs a warning only for unexpected errors. Used by sweeps where concurrent deletion is normal.
- **`toPosixPath(value)`** — Replaces every `\` with `/`. Safe because upload filenames are random hex.
- **`ReapResult`** — `{ checked: number; reaped: number }` shape returned by both sweep functions.
- **`reapDirectory(root, cutoffMs, label)`** — Age-based sweep: deletes files directly under `root` whose `mtime ≤ cutoffMs`. A missing directory is logged at `info` and reported as zero results. Subdirectories are left alone.
- **`pruneUnreferenced(root, keep, minAgeMs?)`** — Reference-based sweep: deletes files under `root` whose basename is **not** in the `keep` set. Respects `minAgeMs` grace period (by `mtime`) so a just-promoted file whose row hasn't been saved yet survives the sweep.

## Relationships

- **`src/infrastructure/adapters/logger.ts`** — Imports `logger`; used by `deleteFile` (error-level) and `unlinkIfPresent` / `reapDirectory` / `pruneUnreferenced` (warn / info).
- **`scripts/ops/reap-quarantine.ts`** — Calls `reapDirectory` for quarantine retention.
- **`src/infrastructure/adapters/mail-spool.ts`** — Calls `reapDirectory` (exposed as `reapSpooled`) for spool retention.
- **`scripts/ops/reap-orphaned-images.ts`** — Calls `pruneUnreferenced` to remove promoted images and thumbnails no longer named by any record.
- **`src/infrastructure/http/middlewares/upload.ts`** — Stages uploads on tmpfs (the cross-mount case `moveFile` handles) and relies on `deleteFile` to clean up multipart files after a failed request.
- **`src/infrastructure/adapters/document-store.ts`, `export-store.ts`, `image-store.ts`, `remote-image.ts`** — Consume the shared helpers (move, delete, sweep) rather than re-deriving the `EXDEV` / log-and-swallow / sweep logic.

## Notes

- `moveFile` **throws**; `deleteFile` and `unlinkIfPresent` **never throw**. Pick the right one — a failed move is a real error, a failed cleanup is a log line.
- The error passed to `logger.error` in `deleteFile` is intentionally nested, not spread, so `redactFormat` → `serializeError` controls whether container paths leak into production logs.
- `reapDirectory` and `pruneUnreferenced` only operate on **files** directly under the given root; subdirectories are never touched (none of the stores create them).
- `pruneUnreferenced`'s `minAgeMs` guard is a safety net for the race where a file is promoted but its row hasn't been committed yet — it is **not** a general age-based policy.
- Stryker mutators are disabled on the log-only lines so mutation testing doesn't flag them as dead code.
