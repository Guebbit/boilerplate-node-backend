---
source: src/infrastructure/adapters/filesystem.ts
source_sha256: 98a540a7a547fdab66a394a23b63126bc8601f04e08988d9dd55294be68802df
context_sha256: 9393449482b8ceabe01196116da1e6c87901a6517537ec45ffa8e0faee3f5023
generated_at: 2026-11-22T02:36:32.186356+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/adapters/filesystem.ts

## Purpose
Small, dependency-light filesystem helpers shared by every adapter that touches disk: a cross-mount move, a non-throwing delete, an atomic write, and two directory sweeps (age-based and reference-based). It centralizes the EXDEV fallback, the log-and-swallow pattern, and the `readdir`/`stat`/`unlink` sweep so other adapters don't re-derive them.

## Key elements
- `moveFile(source, destination)` — `rename`, falling back to `copyFile` then `unlink` only on `EXDEV` (e.g. tmpfs staging to a mounted volume). Copy happens before unlink so a crash leaves a stale staged file rather than losing the upload. **Throws** on any failure; the destination directory must exist.
- `deleteFile(filePath)` — wraps the toolkit's `deleteFile` from `@guebbit/js-toolkit`. Never throws; errors are logged at `error` level with the Error nested under `error`. Used to clean up multer uploads (`request.file.path`) after failed validation.
- `unlinkIfPresent(filePath, message, fields)` — unlinks a file and resolves to `true` if deleted. `ENOENT` returns `false` silently. Any other error logs a `warn` with the caller's `message` and `fields`, then returns `false`. Never throws.
- `writeFileAtomically(target, write)` — passes a sibling temp path (`<target>.<12 hex chars>.tmp`) to the `write` callback, then renames it over `target`. On failure it removes the temp file via `unlinkIfPresent` and rethrows.
- `toPosixPath(value)` — replaces every backslash with `/` to produce URL paths. It is deliberately not `path.posix.normalize`.
- `ReapResult` — `{ checked, reaped }` counts returned by the sweeps.
- `reapDirectory(root, cutoffMs, label)` — deletes regular files directly under `root` whose `mtime` is at or before `cutoffMs`. A missing `root` is logged at `info` and reported as zero. Subdirectories are skipped. A file that vanishes mid-sweep (`ENOENT`) counts as not reaped. Other errors throw.
- `pruneUnreferenced(root, keep, minAgeMs = 0)` — deletes files directly under `root` whose basename isn't in `keep`. Files younger than `minAgeMs` are spared. A missing `root` yields an empty result. Deletion goes through `unlinkIfPresent`. A failed `stat` that isn't `ENOENT` logs a `warn` and leaves the file in place.

## Relationships
- Imports `logger` from `src/infrastructure/adapters/logger.ts` for all error, warn and info output.
- The doc comments name `mail-spool.ts#reapSpooled` as a caller of `reapDirectory`, alongside the `reap:quarantine` job. `reap:orphaned-images` is named as the one caller of `pruneUnreferenced`. The neighbors `src/app/jobs.ts` and `orphaned-images.ts` are where such reapers would sit, but the file itself doesn't say which neighbor calls what.
- `document-store.ts`, `export-store.ts`, `image-store.ts`, `remote-image.ts` and `upload.ts` are graph neighbors. The file states that other disk-touching adapters build on these helpers, and `upload.ts` produces the multer paths `deleteFile` cleans up. The exact call sites aren't visible here.

## Notes
- Error-handling contract differs by function. `moveFile` and the sweeps throw. `deleteFile` and `unlinkIfPresent` never throw.
- `reapDirectory` and `pruneUnreferenced` handle a flat directory only. Subdirectories are never touched or recursed into.
- `pruneUnreferenced` applies the age check only when `minAgeMs > 0`. A zero grace period means every unreferenced file is deleted.
- `deleteFile` keeps the Error nested under `error` rather than spreading it, so `redactFormat`/`serializeError` can keep stacks out of production logs.
- `writeFileAtomically` relies on same-directory `rename` being atomic on POSIX.
- `toPosixPath` is only safe because upload filenames are random hex and never contain a literal backslash.
