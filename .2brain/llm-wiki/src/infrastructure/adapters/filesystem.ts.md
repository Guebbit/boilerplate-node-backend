---
source: src/infrastructure/adapters/filesystem.ts
sha256: c62b39ed86c1c7abd917dff732c960572454d32759889354a4d5077bfea0fb84
generated_at: 2026-11-14T17:53:30.734314+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/filesystem.ts

## Purpose

Low-level filesystem helpers shared by every adapter that touches disk: a cross-mount-safe `move`, two flavors of non-throwing delete, an atomic write, a POSIX-path normalizer, and two directory-sweep utilities (age-based and reference-based). It exists so other adapters stop re-deriving the `EXDEV` fallback, the log-and-swallow pattern, or the `readdir`/`stat`/`unlink` sweep on their own.

## Key elements

- **`moveFile(source, destination)`** — `rename` with a catch that falls back to `copyFile` + `unlink` on `EXDEV` (tmpfs→mounted volume). **Throws** on any non-`EXDEV` failure; a failed move means the bytes are not where the DB will say they are.
- **`deleteFile(filePath)`** — wraps `@guebbit/js-toolkit`'s `deleteFile` with an error-callback that logs at `error` level. Never throws; intended for cleanup after a failed upload where a secondary failure must not become a 500.
- **`unlinkIfPresent(filePath, message, fields)`** — `unlink` that treats `ENOENT` as silent success (returns `false`). Logs `warn` for any other error, letting the caller supply identifying `fields`.
- **`writeFileAtomically(target, write)`** — calls `write` with a random-suffixed temp path, then `rename`s over `target`. Cleans up the temp file and rethrows on failure.
- **`toPosixPath(value)`** — replaces backslashes with forward slashes. Safe here because upload filenames are random hex.
- **`ReapResult`** — `{ checked: number; reaped: number }` interface returned by both sweep functions.
- **`reapDirectory(root, cutoffMs, label)`** — deletes files under `root` whose `mtime ≤ cutoffMs`. Missing `root` is logged at `info` and reported as zero.
- **`pruneUnreferenced(root, keep, minAgeMs?)`** — deletes files under `root` whose basename is **not** in `keep`. Optional `minAgeMs` grace period skips files newer than the threshold (protects a just-promoted image whose DB row may not be saved yet).

## Relationships

- **`@infrastructure/adapters/logger`** — imports `logger`; every error/warn/info path in this file routes through it.
- **`src/infrastructure/http/middlewares/upload.ts`** — stages uploads on tmpfs; `moveFile` moves them to the mounted public volume, and `deleteFile` cleans them up when validation fails after the write.
- **`src/infrastructure/adapters/mail-spool.ts`** — its `reapSpooled` job calls `reapDirectory` for age-based cleanup.
- **`src/infrastructure/adapters/orphaned-images.ts`** (and the `reap:orphaned-images` job in **`src/app/jobs.ts`**) — calls `pruneUnreferenced` for reference-based cleanup of promoted images/thumbnails.
- **`src/app/jobs.ts`** — hosts the `reap:quarantine` and `reap:orphaned-images` cron jobs that drive `reapDirectory` and `pruneUnreferenced` respectively.
- **`src/infrastructure/adapters/document-store.ts`, `export-store.ts`, `image-store.ts`, `remote-image.ts`** — per the module doc, these adapters build on the helpers in this file rather than re-implementing the `EXDEV` fallback or the sweep logic.

## Notes

- **`moveFile` throws; `deleteFile` does not.** The asymmetry is deliberate: a failed move corrupts the data story, a failed cleanup is an operational hiccup.
- **Error object handling in `deleteFile`:** the `Error` is kept nested under the `error` key (never spread into top-level fields) so `redactFormat`'s `serializeError` can strip container paths from production logs. Spreading would bypass that redaction.
- **`toPosixPath` is not a general POSIX normalizer** — `path.posix.normalize` would leave backslashes alone (they are legal filename chars on POSIX). The literal `replaceAll` is safe only because the only inputs are random-hex upload filenames.
- **`pruneUnreferenced` minAge guard:** `minAgeMs > 0` is checked explicitly; with `minAgeMs = 0` (default) a file written in the same millisecond is *not* considered "young," because `mtime` is fractional while `Date.now()` is integer-millis.
- **Sweep functions skip subdirectories unconditionally** — none of the stores that use them write nested directories.
- **Stryker annotations** (`disable next-line all` / `disable all`) appear on log statements to suppress meaningless mutations of the logging calls.
