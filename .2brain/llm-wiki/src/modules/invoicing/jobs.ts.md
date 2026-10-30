---
source: src/modules/invoicing/jobs.ts
sha256: 2941c27283815a829d4e9cd1257a39088df27226232e48617bfece0dd9bb928f
generated_at: 2026-10-29T04:11:54.953719+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/jobs.ts

## Purpose

Declares the two scheduled jobs owned by the invoicing module — a stored-PDF reaper and a buyer-block reaper — and exports them as a `JobDeclaration` array for the kernel registry.

## Key elements

- **`retentionMs()`** (private) — Resolves `NODE_INVOICE_PDF_RETENTION_DAYS` from invoicing config and multiplies by `DAY_MS`. Zero days yields a zero-ms window, meaning every stored document is eligible for reaping.
- **`invoicingJobs`** (export, `readonly JobDeclaration[]`) — The module's job list:
  - **`reapInvoicePdfs`** — Calls `reapDocuments(retentionMs())`, then logs the `{ checked, reaped }` outcome. Marked `connectFirst: false` because it never opens a Mongo connection.
  - **`reapInvoices`** — Calls `eraseDueBuyers()`, then logs the erased-buyer summary.

## Relationships

- **`jobs.generated.ts`** — Supplies `invoicingJobData` (id, schedule, description, etc.) that is spread into each declaration; this file only adds the `run` callback.
- **`config.ts`** — Source of the `NODE_INVOICE_PDF_RETENTION_DAYS` tunable.
- **`time.ts`** — Provides the `DAY_MS` constant used in the retention calculation.
- **`document-store.ts`** — Exposes `reapDocuments()`, the actual sweep logic for the PDF job.
- **`retention.ts`** — Exposes `eraseDueBuyers()`, the actual sweep logic for the buyer-block job.
- **`logger.ts`** — Structured logging of each job's outcome after execution.
- **`registry.ts`** — Defines the `JobDeclaration` type that shapes the exported array.
- **`module.ts`** — Consumes `invoicingJobs` to register them with the kernel.

## Notes

- `connectFirst: false` on `reapInvoicePdfs` is intentional: the job only touches the document store, never Mongo, so the framework should skip the pre-connection step.
- Zero retention days is a valid, meaningful configuration (reap everything immediately), not an error state.
- Job metadata (IDs, schedules) lives in the generated file; edit there, not here.
