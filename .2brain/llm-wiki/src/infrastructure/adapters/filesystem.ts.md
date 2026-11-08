---
source: src/infrastructure/adapters/filesystem.ts
sha256: 0584f2b875a60b11787c4c11f0d872c58e95b827e0d5bfaae553443ef0312d4f
generated_at: 2026-11-08T03:19:04.904679+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/filesystem.ts

## Purpose

Shared low-level filesystem utilities (cross-mount move, safe delete, atomic write, directory sweep) that every other disk-touching adapter in the codebase calls instead of re-implementing the same EXDEV fallback, error-swallowing, or `readdir`/`stat`/`unlink` sweep logic.

## Key elements

- **`moveFile(source, destination)`** — Renames a file; on `EXDEV` (different mount) falls back to `copyFile` + `unlink`. **Throws** on non-EXDEV errors. Destination directory must already exist.
- **`deleteFile(filePath)`** — Unlinks via `@guebbit/js-toolkit`'s `deleteFile` with an error callback. **Never throws**; logs at `error` level. Intended for cleanup of already-staged uploads after a failed request.
- **`unlinkIfPresent(filePath, message, fields)`** — Unlinks and returns `true`/`false`. Treats `ENOENT` as a silent success (no log). For other errors, logs a `warn` with caller-supplied identifying `fields`. Used by `writeFileAtomically` and `pruneUnreferenced`.
- **`writeFileAtomically(target, write)`** — Calls `write(tmpPath)` on a sibling temp file (`<target>.<hex>.tmp`), then `rename`s over `target`. On failure, unlinks the temp and rethrows.
- **`toPosixPath(value)`** — Replaces all backslashes with forward slashes. Safe only because upload filenames are random hex (never contain a literal backslash).
- **`ReapResult`** (interface) — `{ checked: number; reaped: number }` return shape for both sweep functions.
- **`reapDirectory(root, cutoffMs, label)`** — Deletes flat files under `root` whose `mtimeMs ≤ cutoffMs`. Missing directory is logged at `info` and returns zeros. Subdirectories are ignored.
- **`pruneUnreferenced(root, keep, minAgeMs?)`** — Deletes flat files under `root` whose basename is **not** in `keep`. Optional `minAgeMs` grace period skips recently modified files. Missing directory returns zeros. Subdirectories are ignored.

## Relationships

- **`src/infrastructure/adapters/logger.ts`** — Direct import; every non-throwing error path in this file routes through `logger.error` / `logger.warn` / `logger.info`.
- **`src/infrastructure/http/middlewares/upload.ts`** — Calls `moveFile` to stage uploads from tmpfs to the public volume and `deleteFile` to clean up on validation failure.
- **`src/app/jobs.ts`** — Schedules `reapDirectory` (quarantine retention) and `pruneUnreferenced` (orphaned images) on intervals.
- **`src/infrastructure/adapters/document-store.ts`**, **`export-store.ts`**, **`image-store.ts`** — Rely on `moveFile`, `writeFileAtomically`, and `reapDirectory` for their read/write/retention paths.
- **`src/infrastructure/adapters/mail-spool.ts`** — Uses `reapDirectory` (`reapSpooled`) and `unlinkIfPresent` for spool lifecycle.
- **`src/infrastructure/adapters/orphaned-images.ts`** — Uses `pruneUnreferenced` to remove promoted images/thumbnails no longer referenced by any row.
- **`src/infrastructure/adapters/remote-image.ts`** — Uses `moveFile` / `deleteFile` when caching remote images locally.

## Notes

- **`moveFile` throws; `deleteFile` does not.** This is deliberate and non-obvious: a failed move means the DB is about to record a path that doesn't exist (data corruption), while a failed delete is a best-effort cleanup of a file the request no longer needs.
- **`unlinkIfPresent` vs `deleteFile`:** `unlinkIfPresent` is used *internally* by this file and by adapters that need a boolean return and custom warning context; `deleteFile` is the "fire-and-forget" variant for HTTP cleanup. Don't swap them.
- **`toPosixPath` is not a general normalizer.** It does no `..` resolution or redundant-slash collapse. It exists solely because Node on Windows may emit `\` separators and the codebase assumes `/` in URLs.
- **Sweep functions are single-pass and flat.** They do not recurse. If a subdirectory ever appears under a swept root, it is silently skipped — there is no guard or warning for that case.
- **`pruneUnreferenced` grace period:** when `minAgeMs > 0`, a file whose `mtimeMs` is within `minAgeMs` of `Date.now()` is preserved. With `minAgeMs === 0` (default) no age check is applied and only the `keep` set matters.
- **Mutation-testing annotations** (`Stryker disable`/`restore`) are inline; don't remove them when editing log lines — they suppress false-positive mutants on `logger.*` calls.
