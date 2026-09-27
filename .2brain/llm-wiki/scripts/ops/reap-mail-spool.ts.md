---
source: scripts/ops/reap-mail-spool.ts
sha256: 9b3f76749f5ab5a22de6b02714a72034c77607760d9b7a2fa9951943ceeb3be9
generated_at: 2026-09-27T13:57:32.207698+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/reap-mail-spool.ts

## Purpose

A scheduled (cron / container-task) script that sweeps abandoned spooled mail attachments from the filesystem. A spooled file outlives its mail job only when something went wrong (job died between `spoolAttachment()` and send, or was lost). This is the backstop cleanup; it is not intended for manual invocation.

## Key elements

- **`retentionMs()`** — Reads `NODE_MAIL_SPOOL_RETENTION_HOURS` (default `1`) via `environmentNumber` and returns the threshold in milliseconds. Files older than this are considered abandoned.
- **`main`** — Calls `reapSpooled(retentionMs())`, logs an info line if any files were reaped, then calls `start()` to connect Mongo. The sweep itself never touches Mongo.
- **`runScript('reap:mail-spool', main, stopDatabase)`** — Entry-point wrapper: records the job outcome in the `leases` collection, and calls `stopDatabase` on exit.

## Relationships

- **`src/infrastructure/adapters/mail-spool.ts`** — Supplies `reapSpooled`, the actual filesystem sweep. This is the only function that touches the spool directory.
- **`scripts/run-script.ts`** — Supplies `runScript`, which manages the Mongo connection lifecycle for the outcome record and the `stopDatabase` teardown callback.
- **`src/infrastructure/runtime/database.ts`** — Provides `start()` (deferred Mongo connect) and `stopDatabase()` (cleanup).
- **`src/infrastructure/runtime/environment.ts`** — Provides `environmentNumber` used to read the retention-hours setting.
- **`src/infrastructure/adapters/logger.ts`** — Provides `logger` for the single info-level log emitted when attachments are reaped.

## Notes

- **Sweep before connect (PL-28).** `reapSpooled` runs *before* `start()` is called. A Mongo outage must not block a purely-filesystem cleanup that doesn't need the database.
- **Concurrency-safe.** `NODE_MAIL_SPOOL_PATH` is never served to clients and is only read/written by `mailer.ts` (the spool) and this script (the reap). A concurrent in-flight send cannot depend on a file past the retention window.
- **Idempotent / repeatable.** Safe to run multiple times; it only deletes files older than the retention threshold.
- **Invocation.** `npm run reap:mail-spool`. Intended as a periodic job, not a one-shot debug tool.
