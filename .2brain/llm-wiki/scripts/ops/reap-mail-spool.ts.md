---
source: scripts/ops/reap-mail-spool.ts
sha256: e3072b3fcc4b79095cc3979e765e9c3139bc3c7ab639bcbc52fec59fdf6e11ab
generated_at: 2026-10-14T07:24:37.558595+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/reap-mail-spool.ts

## Purpose

Periodic cleanup (cron / scheduled task) that deletes abandoned spooled mail attachments. A spooled file only outlives its job when the mail job died between `spoolAttachment()` and the actual send. This is the filesystem backstop for anything that slipped through, intended to run on a schedule rather than by hand.

## Key elements

- **`retentionMs()`** — Reads `NODE_MAIL_SPOOL_RETENTION_HOURS` from `mailFilesConfig()` and converts to milliseconds. Files younger than this window are left alone; anything older is considered abandoned.
- **`main()`** — Orchestrates the sweep: calls `reapSpooled(retentionMs())`, logs the reaped count (only when > 0), then calls `startJob()` to open the Mongo connection needed solely by `runScript`'s outcome record.
- **`runScript('reap:mail-spool', main, stopDatabase)`** — Entry-point wrapper (from `../run-script`). Executes `main`, records the job's outcome in the `leases` collection, and ensures `stopDatabase` runs on both success and failure paths.

## Relationships

- **`scripts/run-script.ts`** — Provides the `runScript` harness: runs the job, writes the outcome to the shared `leases` collection, and guarantees connection cleanup.
- **`src/infrastructure/adapters/mail-spool.ts`** — Source of `reapSpooled()`, the actual filesystem sweep. This script is its only caller.
- **`src/infrastructure/adapters/config.ts`** — Source of `mailFilesConfig()`; supplies the retention-hours value.
- **`src/infrastructure/adapters/logger.ts`** — Provides `logger` for the informational "reaped N files" line.
- **`src/infrastructure/runtime/database.ts`** — Provides `startJob()` (opens Mongo after the sweep) and `stopDatabase()` (closes it at exit).
- **`src/infrastructure/runtime/mongoose-boot.ts`** — Side-effect import that sets Mongoose defaults; must load before any schema is built.
- **`src/infrastructure/config/dotenv.ts`** — Side-effect import that loads `.env` into `process.env` before config reads.

## Notes

- **Sweep-before-connect is deliberate.** The reaping is pure filesystem work; the Mongo connection exists only for `runScript`'s bookkeeping. A Mongo outage will not block the cleanup.
- **Import order matters.** `dotenv` and `mongoose-boot` are imported before any other runtime module so environment variables and Mongoose defaults are in place before `mailFilesConfig()` is ever called or a schema is built.
- **Safe to run repeatedly and concurrently.** The spool directory is never served and is only ever read by `mailer.ts`; there is no window where a concurrent send depends on a file still sitting in the spool past the retention window.
- **Not a manual tool.** The doc block explicitly frames it as a periodic job (cron, scheduled container task). Running it by hand is harmless but not the intended use.
