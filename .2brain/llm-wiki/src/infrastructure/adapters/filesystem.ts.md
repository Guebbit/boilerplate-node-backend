---
source: src/infrastructure/adapters/filesystem.ts
sha256: 2526162271aa23e9b35a089cd56fae38078b13ccb03fc0fb3a2ca97f5b9f0f0e
generated_at: 2026-09-27T14:05:37.463043+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/filesystem.ts

## Purpose

Shared filesystem primitives for the adapter layer: a cross-mount file move, two flavours of non-throwing delete, a path normaliser, and an age-based directory sweep. Every other disk-touching adapter builds on these instead of re-deriving the `EXDEV` fallback, the log-and-swallow pattern, or the `readdir`/`stat`/`unlink` sweep.

## Key elements

- **`moveFile(source, destination)`** – Atomic `rename` with an `EXDEV`-only fallback to `copyFile` + `unlink`. **Throws** on any failure other than the expected cross-device case.
- **`deleteFile(filePath)`** – Fire-and-forget delete via the toolkit's `deleteFile`; routes errors to `logger.error` instead of throwing. Intended for cleaning up multer uploads after a failed request.
- **`unlinkIfPresent(filePath, message, fields)`** – Returns `Promise<boolean>`. Treats `ENOENT` as silent success; logs a warning (with caller-supplied `message` and `fields`) for any other error. Never throws.
- **`toPosixPath(value)`** – Replaces all backslashes with forward slashes. Safe because upload filenames are random hex.
- **`ReapResult`** – `{ checked: number; reaped: number }` shape returned by sweeps.
- **`reapDirectory(root, cutoffMs, label)`** – Deletes every *file* under `root` whose `mtime ≤ cutoffMs`. A missing directory (`ENOENT`) is logged at `info` and reported as `{ checked: 0, reaped: 0 }`, not an error. Subdirectories are ignored.

## Relationships

- **`src/infrastructure/adapters/logger.ts`** – Direct import. All error/warning/info logging in this file goes through the shared `logger`.
- **`scripts/ops/reap-quarantine.ts`** – Calls `reapDirectory` to purge expired quarantine files.
- **`src/infrastructure/adapters/mail-spool.ts`** – Calls `reapDirectory` (via `reapSpooled`) and `unlinkIfPresent` for per-message cleanup.
- **`src/infrastructure/adapters/image-store.ts`** – Consumes `moveFile` and `deleteFile` for upload staging and final placement.
- **`src/infrastructure/http/middlewares/upload.ts`** – Calls `deleteFile` to discard staged uploads when validation fails mid-request.
- **`src/modules/orders/services/invoice.ts`** – Uses `unlinkIfPresent` when cleaning up invoice PDFs it generated.

## Notes

- `moveFile` and `deleteFile` have **opposite** error contracts: the former throws (a failed move corrupts the record the DB is about to write), the latter never throws (a failed cleanup must not turn a 422 into a 500).
- `unlinkIfPresent` deliberately avoids logging the `ENOENT` case; callers pass their own `message`/`fields` so the warning identifies *which* logical entity (orderId, spool key, filename) was affected.
- `reapDirectory` only acts on regular files (`info.isFile()` guard). If a store ever starts writing subdirectories, they will be silently skipped — no error is raised.
- The `EXDEV` catch in `moveFile` is intentionally narrow: any other error code re-throws immediately. The `eslint-disable` comment documents *why* the restricted `try/catch` is acceptable here.
- `toPosixPath` is a naive `replaceAll('\\', '/')` rather than `path.posix.normalize`; this is safe only because the codebase's upload filenames are random hex and can never contain a literal backslash.
