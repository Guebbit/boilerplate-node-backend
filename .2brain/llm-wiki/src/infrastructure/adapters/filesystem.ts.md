---
source: src/infrastructure/adapters/filesystem.ts
sha256: 27ca9fc3ec392aa08653358c636cb2c7f87f0f2451710347d1ae50e841fa0640
generated_at: 2026-10-01T12:47:49.746184+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/filesystem.ts

## Purpose

Shared low-level filesystem helpers (cross-mount move, safe delete, age-based sweep, reference-based prune) so that every other adapter that touches disk reuses a single implementation of the `EXDEV` fallback, the log-and-swallow pattern, and the `readdir`/`stat`/`unlink` sweep rather than re-deriving them independently.

## Key elements

- **`moveFile(source, destination)`** – Renames a file; on `EXDEV` falls back to `copyFile` → `unlink`. **Throws** on any other error (a failed move means the bytes aren't where the DB expects them).
- **`deleteFile(filePath)`** – Delegates to `@guebbit/js-toolkit`'s `deleteFile` with an error callback that logs at `error` level via the shared `logger`. Never throws; intended for cleaning up multer uploads after a failed request.
- **`unlinkIfPresent(filePath, message, fields)`** – Unlinks a file; treats `ENOENT` as silent success (returns `false`). Logs a warning with caller-supplied `fields` for any other error. Returns `Promise<boolean>` (was a file actually deleted?).
- **`toPosixPath(value)`** – Replaces every `\` with `/` (literal `replaceAll`, not `path.posix.normalize`).
- **`ReapResult`** – `{ checked: number; reaped: number }`, the return shape of both sweep functions.
- **`reapDirectory(root, cutoffMs, label)`** – Deletes every *file* directly under `root` whose `mtimeMs <= cutoffMs`. Missing directory → logged at `info`, returns zero result. Subdirectories are ignored.
- **`pruneUnreferenced(root, keep)`** – Deletes every *file* directly under `root` whose basename is **not** in the `keep` set. Reference-based (not age-based). Missing directory → zero result. Uses `readdir` with `withFileTypes` and filters on `entry.isFile()`.

## Relationships

- **`src/infrastructure/adapters/logger.ts`** – Provides the `logger` instance used for all error/warn/info output in this module.
- **`src/infrastructure/http/middlewares/upload.ts`** – Primary consumer of `moveFile` (stage → public) and `deleteFile` (cleanup after validation failure).
- **`scripts/ops/reap-quarantine.ts`** – Calls `reapDirectory` with an age-based cutoff for the quarantine store.
- **`scripts/ops/clean-orphaned-images.ts`** – Calls `pruneUnreferenced` with a set of still-referenced basenames.
- **`src/infrastructure/adapters/mail-spool.ts`** – Calls `reapDirectory` (exposed as `reapSpooled`) for age-based spool cleanup.
- **`src/infrastructure/adapters/image-store.ts`** / **`src/infrastructure/adapters/remote-image.ts`** – Build on `moveFile`, `deleteFile`, or `unlinkIfPresent` for their own disk operations rather than re-implementing the fallbacks.

## Notes

- `moveFile` and `deleteFile` have **opposite error contracts**: move throws (data-loss risk), delete swallows (cleanup must not break the response). Choose deliberately.
- The copy-then-unlink order in `moveFile` is intentional: a crash between the two leaves a *stale staged file*, never a lost upload.
- `deleteFile` logs the `Error` object nested under the `error` key so that `redactFormat`/`serializeError` in the logger controls whether stacks appear in production. Spreading it would bypass that redaction.
- `toPosixPath` is safe only because upload filenames are random hex (no backslash ambiguity). Do not use it for arbitrary user-supplied names.
- Both sweep functions (`reapDirectory`, `pruneUnreferenced`) operate on **flat directories only**; subdirectories are silently skipped by design.
- `unlinkIfPresent` treats `ENOENT` as the *normal* racing case (another reaper got there first) and does not log it — the caller is expected to log contextually if it needs to.
- Stryker mutation-testing `disable`/`restore` annotations guard the log-only branches so mutants that remove the `logger.*` call are not flagged.
