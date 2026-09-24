---
source: src/infrastructure/adapters/filesystem.ts
sha256: 41e068c7024b6b2eafb4a13e6ec50f9acd70393c6d56125c49d7996e012031a8
generated_at: 2026-09-23T17:38:57.583512+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/filesystem.ts

## Purpose

Low-level filesystem helpers shared across all disk-touching adapters: a cross-mount move, two flavors of safe delete, a path normalizer, and an age-based flat-directory sweep. Exists so that `image-store`, `mail-spool`, the upload middleware, and the quarantine reaper each build on one implementation of the EXDEV fallback, the log-and-swallow pattern, and the `readdir`/`stat`/`unlink` sweep instead of re-deriving them.

## Key elements

- **`moveFile(source, destination)`** — Atomic `rename`; on `EXDEV` falls back to `copyFile` then `unlink`. **Throws** on any non-EXDEV failure (a failed move means bytes and DB are out of sync).
- **`deleteFile(filePath)`** — Deletes via `@guebbit/js-toolkit`'s `deleteFile`, routing errors to `logger.error` instead of rejecting. Never throws.
- **`unlinkIfPresent(filePath, message, fields)`** — Deletes a file; `ENOENT` is a silent success (returns `false`). Any other error logs a `warn` with caller-supplied identifying `fields`. Returns `true` only if a file was actually removed.
- **`toPosixPath(value)`** — Replaces backslashes with forward slashes. Safe only because upload filenames are random hex (never contain `\`).
- **`ReapResult`** — `{ checked: number; reaped: number }` shape returned by sweeps.
- **`reapDirectory(root, cutoffMs, label)`** — Lists `root`, stats each entry, unlinks files whose `mtime ≤ cutoffMs`. A missing directory is logged at `info` and reported as `{ checked: 0, reaped: 0 }`. Subdirectories are skipped (no store writes them).

## Relationships

- **`logger.ts`** — Provides the `logger` instance used for error/warn/info logging in `deleteFile`, `unlinkIfPresent`, and `reapDirectory`.
- **`scripts/ops/reap-quarantine.ts`** — Calls `reapDirectory` to purge aged quarantine files.
- **`src/infrastructure/adapters/mail-spool.ts`** — Calls `reapDirectory` (its `reapSpooled` function) for spool retention.
- **`src/infrastructure/http/middlewares/upload.ts`** — Calls `deleteFile` to clean up multer-staged uploads when downstream validation fails.
- **`src/infrastructure/adapters/image-store.ts`** — Consumes `moveFile` (staging → public) and/or `unlinkIfPresent` for per-order image cleanup.
- **`src/modules/orders/services/invoice.ts`** — Uses `moveFile` / `unlinkIfPresent` for invoice PDF lifecycle (write → publish → reap).

## Notes

- **`moveFile` throws; `deleteFile` does not.** This is deliberate: a failed move is a data-integrity error the caller must surface; a failed cleanup is best-effort and must not turn a validation error into a 500.
- **Copy-then-unlink order** in the `EXDEV` fallback is intentional: a crash between the two leaves a stale staged file (recoverable) rather than losing the upload.
- **`unlinkIfPresent` vs `deleteFile`:** the former treats `ENOENT` as an expected no-op (racing reapers) and suppresses logging; the latter logs every failure at `error` level because an undeletable file usually signals a permissions or mount misconfiguration.
- **`reapDirectory` is flat-only.** It does not recurse. Stores that need nested cleanup must compose their own logic.
- **`Stryker disable`** comments suppress mutation testing on log-emitting lines (killing the log call wouldn't change observable behavior in a unit test).
- **`toPosixPath` is not a general path normalizer.** It is a one-way separator swap safe only for the known hex-named upload filenames; do not use it for arbitrary user-supplied paths.
