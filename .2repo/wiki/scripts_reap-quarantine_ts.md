# scripts/reap-quarantine.ts

## Purpose

Periodic backstop script that deletes quarantine files older than a configurable retention window. In normal operation every pipeline success or handled failure removes its own quarantine file; this script catches the leftovers from crashes, unregistered collections, or lost deliveries. Intended to run as a scheduled job (cron, container task) via `npm run reap:quarantine`, not by hand.

## Key elements

- **`quarantineRoot()`** — Resolves the quarantine directory from `NODE_QUARANTINE_PATH` (defaults to `./quarantine`).
- **`retentionMs()`** — Returns the retention threshold in milliseconds, read from `NODE_QUARANTINE_RETENTION_HOURS` (default 24 h, minimum 1 h) via `environmentNumber`.
- **`main()`** — Reads the directory, stats each entry, and `unlink`s flat files whose `mtimeMs` is older than the cutoff. Skips directories and recently-touched files. Logs a summary (`checked` vs `reaped`). Treats a missing directory (ENOENT) as a clean no-op.
- **`runScript(main, () => Promise.resolve())`** — Wraps `main` in the project's script-lifecycle helper; the teardown callback is a no-op because the script is filesystem-only.

## Relationships

- **`db/run-script.ts`** — Provides `runScript`, which manages the process signal/lifecycle around the async `main`. The second argument (teardown) is unused here since there is nothing to clean up.
- **`src/infrastructure/adapters/logger.ts`** — Supplies the structured `logger` used for the "nothing to reap" and "Quarantine reaped" info messages.
- **`src/infrastructure/runtime/environment.ts`** — Supplies `environmentNumber`, which parses `NODE_QUARANTINE_RETENTION_HOURS` with a default and a minimum bound, avoiding manual `parseInt`/validation.

## Notes

- Idempotent and safe to run concurrently with the pipeline: the quarantine path is never served and only read by the digest pipeline, so no in-flight request can depend on a file past the retention window.
- Only flat files are reaped; subdirectories are skipped (the quarantine store is designed to write flat files only).
- The 24-hour default retention is deliberately longer than a typical broker maintenance window so a transient outage does not cause data loss.
- The script exits cleanly (exit 0) if the quarantine directory does not exist — this is the expected state in fresh environments.
