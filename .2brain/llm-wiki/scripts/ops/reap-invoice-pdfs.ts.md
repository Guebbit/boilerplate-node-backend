---
source: scripts/ops/reap-invoice-pdfs.ts
sha256: a9e0d6e853c4d45fc5f4d536df33c42065449a438e92b5dd8fd7c6282f08770a
generated_at: 2026-10-14T07:24:20.729513+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/reap-invoice-pdfs.ts

## Purpose

Cron job (`npm run reap:invoice-pdfs`) that deletes stored invoice and credit-note PDF files past their retention window. The PDFs are regenerable copies; the frozen invoice data in Mongo is the legal record. The script is filesystem-only for the sweep and connects to Mongo briefly solely so `runScript` can record the job outcome in `leases`.

## Key elements

- **`retentionMs()`** — Converts `invoicingConfig().NODE_INVOICE_PDF_RETENTION_DAYS` (default 30) into milliseconds. A value of `0` yields a zero-width window, meaning every stored file is a deletion candidate.
- **`main()`** — Calls `reapDocuments(retentionMs())`, logs `{ checked, reaped }`, then calls `startJob()` to open the Mongo connection (needed only by `runScript`'s recording step).
- **Entry-point call** — `runScript('reap:invoice-pdfs', main, stopDatabase)` wraps `main`, records the outcome under the job name, and ensures the connection is closed on both success and failure paths.

## Relationships

- **`scripts/run-script.ts`** — Supplies `runScript`, which executes the job, writes the result to the `leases` collection, and manages the process lifecycle (exit code, teardown).
- **`src/infrastructure/adapters/document-store.ts`** — Supplies `reapDocuments`, the actual filesystem sweep that deletes files older than the retention window and returns `{ checked, reaped }`.
- **`src/infrastructure/adapters/logger.ts`** — Provides the `logger` used to emit the completion info line.
- **`src/infrastructure/config/dotenv.ts`** — Side-effect import; loads environment variables before any other module reads config.
- **`src/infrastructure/runtime/mongoose-boot.ts`** — Side-effect import; must run before any Mongoose model is loaded so schema-level defaults are applied correctly.
- **`src/infrastructure/runtime/database.ts`** — Provides `startJob` (opens the connection) and `stopDatabase` (closes it on teardown).
- **`src/modules/invoicing/config.ts`** — Provides `invoicingConfig()` from which the retention-days value is read.

## Notes

- **Import order is deliberate.** `dotenv` must load before `mongoose-boot`, which must load before any model-dependent import. A reordering can silently break schema defaults.
- **Age is mtime, not access time.** A file's "age" is its modification time (set at render time), not the last download. Re-downloading a PDF does not extend its life.
- **Retention `0` is valid.** It means "store nothing," so the directory is empty (or absent) and the sweep is a no-op — not an error.
- **Idempotent and safe to run repeatedly.** It only deletes files older than the window; running it twice changes nothing the second time.
- **Ownership.** This script, the `reap:invoice-pdfs` npm script, and its `docker/crontab` entry are all owned by the `invoicing` module.
