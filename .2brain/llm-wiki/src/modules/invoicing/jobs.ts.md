---
source: src/modules/invoicing/jobs.ts
sha256: 0ab46090f27296343a23492c16e7652d320f9f1a86fc0798b4af4dea963650f2
generated_at: 2026-11-14T20:11:56.327857+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/jobs.ts

## Purpose

Declares the two scheduled jobs owned by the `invoicing` module: a stored-PDF reaper and a buyer-block reaper. Each job wires together a concrete action (deletion of expired documents or invoice buyer records) with logging, and is registered via the kernel job registry.

## Key elements

- **`invoicingJobs`** (exported, `readonly JobDeclaration[]`) — the array the module hands to the kernel. Contains two entries:
  - *reapInvoicePdfs* — calls `reapDocuments` with a retention window derived from `invoicingConfig().NODE_INVOICE_PDF_RETENTION_DAYS × DAY_MS`, then logs the checked/reaped counts.
  - *reapInvoices* — calls `eraseDueBuyers()` and logs the erased count.

## Relationships

- **`src/kernel/registry.ts`** — provides the `JobDeclaration` type that each entry conforms to.
- **`src/modules/invoicing/module.ts`** — the consuming side; registers `invoicingJobs` with the kernel.
- **`src/modules/invoicing/config.ts`** — supplies `invoicingConfig()` to resolve the PDF retention-days value at run time.
- **`src/modules/invoicing/services/retention.ts`** — provides `eraseDueBuyers()` used by the buyer-block job.
- **`src/infrastructure/adapters/document-store.ts`** — provides `reapDocuments()` used by the PDF job.
- **`src/infrastructure/adapters/logger.ts`** — provides `logger` for post-action outcome logging.
- **`src/domain-primitives/time.ts`** — provides the `DAY_MS` constant for the retention-window calculation.

## Notes

- Job metadata (id, schedule, etc.) is spread in from `./jobs.generated` (`invoicingJobData`); the hand-written portion only supplies `run` and, where needed, `connectFirst`.
- `connectFirst: false` on the PDF job signals that the sweep itself does **not** require a prior Mongo connection—only the downstream record-keeping step does.
- A retention value of `0` is meaningful: it means *every* stored document is reaped, not "no retention."
