---
source: src/infrastructure/adapters/filesystem.ts
sha256: 0584f2b875a60b11787c4c11f0d872c58e95b827e0d5bfaae553443ef0312d4f
generated_at: 2026-10-29T01:53:56.272901+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/filesystem.ts

## Purpose

Shared, dependency-light filesystem primitives that every other disk-touching adapter builds on: a cross-mount move, two flavors of non-throwing delete, an atomic write, and two directory-sweep helpers (age-based and reference-based). Exists so no other adapter re-derives the EXDEV fallback, the log-and-swallow pattern, or the `readdir`/`stat`/`unlink` sweep independently.

## Key elements

- **`moveFile(source, destination)`** — Atomic `rename` with an EXDEV-only fallback to `copyFile` + `unlink`. **Throws** on any non-EXDEV error; a failed move means the client's bytes are lost.
- **`deleteFile(filePath)`** — Wraps `@guebbit/js-toolkit`'s `deleteFile` with an error callback that logs at `error` level. Never throws. Used for cleanup of multer uploads after a failed request.
- **`unlinkIfPresent(filePath, message, fields)`** — Unlink that treats `ENOENT` as success (returns `false`, no log). Logs a warning for other errors. Returns a `Promise<boolean>` indicating whether a file was actually removed.
- **`writeFileAtomically(target, write)`** — Writes to a random-hex `.tmp` sibling, then `rename`s over `target`. Cleans up the temp file and rethrows on failure.
- **`toPosixPath(value)`** — `replaceAll('\\', '/')`. Not `path.posix.normalize`, which would leave backslashes alone.
- **`ReapResult`** — `{ checked: number; reaped: number }` returned by both sweep functions.
- **`reapDirectory(root, cutoffMs, label)`** — Deletes files whose `mtime ≤ cutoffMs`. Missing directory is a no-op (logged at `info`). Files only; subdirectories untouched.
- **`pruneUnreferenced(root, keep, minAgeMs?)`** — Deletes files whose basename is **not** in the `keep` set. Optional `minAgeMs` grace period protects very new files. Missing directory is a no-op.

## Relationships

- **`logger.ts`** — Direct import. `deleteFile`, `unlinkIfPresent`, `reapDirectory`, and `pruneUnreferenced` all route their error/warning logs through the shared logger.
- **`upload.ts` (middleware)** — The staging path for incoming uploads; `moveFile` is the natural target for persisting a staged upload, and `deleteFile` cleans up the temp file when validation fails after multer has written it.
- **`document-store.ts`, `image-store.ts`, `export-store.ts`, `remote-image.ts`** — Adapters that read/write files on disk; each relies on `moveFile`, `writeFileAtomically`, or `deleteFile` rather than importing `node:fs/promises` directly for those operations.
- **`mail-spool.ts`** — Caller of `reapDirectory` for its spooled-message retention sweep (`reapSpooled`).
- **`orphaned-images.ts`** — Caller of `pruneUnreferenced` for the `reap:orphaned-images` job, passing the set of basenames still referenced by image rows.
- **`jobs.ts`** — Schedules the retention/reaper jobs that ultimately invoke `reapDirectory` and `pruneUnreferenced`.

## Notes

- `moveFile` **throws**; `deleteFile` and `unlinkIfPresent` do **not**. Choosing the wrong one for a cleanup path is a common mistake.
- The EXDEV fallback is copy-then-unlink (not unlink-then-copy) so a crash between the two leaves a stale staged file rather than losing the upload.
- `deleteFile` logs the full `Error` object as a nested field (not spread), relying on the logger's `serializeError` / `redactFormat` to keep container paths out of production output.
- `reapDirectory` and `pruneUnreferenced` both treat a missing directory (`ENOENT` on `readdir`) as "nothing to do," not an error — a store that never wrote anything is the expected initial state.
- `toPosixPath` is safe only because upload filenames are random hex and can never contain a backslash; do not repurpose it for arbitrary user-supplied paths.
- `pruneUnreferenced`'s `minAgeMs` default is `0`, meaning no grace period; the orphaned-images caller passes a positive value to avoid deleting a file promoted in the same instant before its DB row is saved.
