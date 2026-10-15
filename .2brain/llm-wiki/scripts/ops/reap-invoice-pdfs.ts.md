---
source: scripts/ops/reap-invoice-pdfs.ts
sha256: 40ddf4209217a61d629499bd858b2363f29903cc7a2fc6c3a6843485cbc282b8
generated_at: 2026-10-15T09:44:15.824120+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/reap-invoice-pdfs.ts

## Purpose

Ops script (`npm run reap:invoice-pdfs`) that deletes stored invoice and credit-note PDF files older than the configured retention window. The PDFs are regenerable copies; the frozen invoice data in Mongo is the legal record, so deleting a file only costs a re-render on the next download. The job is filesystem-only and idempotent, but briefly opens a Mongo connection solely so `runScript` can record the outcome in `leases` for health observability.

## Key elements

- **`retentionMs()`** — Computes the retention window in milliseconds from `invoicingConfig().NODE_INVOICE_PDF_RETENTION_DAYS`. Zero days yields a zero window (everything stored is reaped).
- **`main()`** — Calls `reapDocuments(retentionMs())`, logs the `{checked, reaped}` summary, then calls `startJob()` to open Mongo *after* the filesystem sweep is done.
- **`void runScript('reap:invoice-pdfs', main, stopDatabase)`** — Entry point. Wraps `main`, records the job outcome under the key `reap:invoice-pdfs`, and guarantees `stopDatabase` runs on both success and failure paths.

## Relationships

- **`scripts/run-script.ts`** — Provides `runScript`, which runs the job, records the outcome in the `leases` collection, and invokes the cleanup callback (`stopDatabase`).
- **`src/infrastructure/adapters/document-store.ts`** — Supplies `reapDocuments()`, the actual filesystem sweep that deletes PDFs past the given age.
- **`src/infrastructure/adapters/logger.ts`** — Used to log the reap summary.
- **`src/infrastructure/config/dotenv.ts`** — Imported first to load environment variables before anything else reads config.
- **`src/infrastructure/runtime/mongoose-boot.ts`** — Imported second to apply Mongoose defaults *before* any schema/model is built.
- **`src/infrastructure/runtime/database.ts`** — Provides `startJob` (opens the brief Mongo connection) and `stopDatabase` (closes it).
- **`src/modules/invoicing/config.ts`** — Exposes `invoicingConfig()` which reads `NODE_INVOICE_PDF_RETENTION_DAYS` (default 30).

## Notes

- **Import order is load-bearing.** `dotenv` and `mongoose-boot` must resolve before any module that builds a Mongoose schema; a reordering here is a silent bug.
- **Mongo is opened *after* the sweep.** The filesystem work never touches Mongo. Only the `runScript` bookkeeping does, keeping the destructive step isolated from any DB failure.
- **Retention of `0` is a valid config** meaning "store nothing." The script still runs, finds an empty or absent directory, and records a clean (zero-count) result.
- **Age is measured by file mtime** (render time), not last-access time, so re-downloading a PDF does not extend its life.
- **Removal of this file is owned by the `invoicing` module.** Deleting the script, its `npm run` entry, and its `docker/crontab` line should happen together (see `docs/modules/invoicing.md`).
