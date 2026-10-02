---
source: scripts/ops/reap-mail-spool.ts
sha256: 82956e50eb0cdcde21e4e54f2d586ca2295ae65076a45f1557313525b8fe41f1
generated_at: 2026-10-01T12:36:23.296262+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/reap-mail-spool.ts

## Purpose

Periodic backstop script (`npm run reap:mail-spool`) that deletes spooled mail attachments older than a retention window. A spooled file outlives its job only when something failed between `spoolAttachment()` and the actual send; this sweep is the safety net. Intended to run on a cron/scheduled schedule, not manually.

## Key elements

- **`retentionMs()`** — Converts `NODE_MAIL_SPOOL_RETENTION_HOURS` (from config) into milliseconds. Default is 1 hour.
- **`main()`** — Calls `reapSpooled(retentionMs())`, logs a summary if any files were removed, then calls `start()` (Mongo). The order is deliberate: the filesystem sweep completes before any DB connection is attempted.
- **`void runScript('reap:mail-spool', main, stopDatabase)`** — Entry point. Wraps `main` so the job's outcome is recorded in the shared `leases` collection and `stopDatabase` runs on exit.

## Relationships

- **`scripts/run-script.ts`** — Provides the `runScript` harness: records the job outcome in the `leases` collection and manages DB lifecycle (start/stop) around the script.
- **`src/infrastructure/adapters/mail-spool.ts`** — Source of `reapSpooled()`, the actual filesystem sweep of the spool directory.
- **`src/infrastructure/adapters/config.ts`** — Source of `mailFilesConfig()` which supplies `NODE_MAIL_SPOOL_RETENTION_HOURS`.
- **`src/infrastructure/runtime/database.ts`** — `start()` / `stopDatabase()` manage the brief Mongo connection needed only for the `runScript` outcome record.
- **`src/infrastructure/adapters/logger.ts`** — Emits an info log when one or more attachments are reaped.

## Notes

- **Sweep-before-connect order (PL-28):** The reaping itself is pure filesystem work. Mongo is connected only afterward for the `runScript` bookkeeping. A Mongo outage therefore does not block cleanup.
- **Concurrency safety:** `NODE_MAIL_SPOOL_PATH` is never served externally and is only read by `mailer.ts`; after the retention window no concurrent send should depend on those files, making repeated/re-entrant runs safe.
- **Retention is a hard floor, not a grace period:** 1 hour is the default; a normal mail job settles in seconds, so anything still present past that is treated as abandoned.
