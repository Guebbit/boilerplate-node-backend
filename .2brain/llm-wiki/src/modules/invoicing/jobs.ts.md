---
source: src/modules/invoicing/jobs.ts
source_sha256: 1ff17f16e87ba328c760f1e883a592c32d7d48ea948f3cfb23ef76c00b5a1d84
context_sha256: 437923c641c2c27cda6fbb5e79d9fb9bb28b2aa46c40641432eca831e559bffb
generated_at: 2026-11-22T05:31:49.692830+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/invoicing/jobs.ts

## Purpose
Declares the scheduled jobs owned by the `invoicing` module: one that reaps stored invoice PDFs past their retention window, and one that erases buyer blocks on invoices that are due for erasure. The file exports them as a list of `JobDeclaration`s for the kernel to register.

## Key elements
- `invoicingJobs` — `readonly JobDeclaration[]` with two entries:
  - **`reapInvoicePdfs`** — calls `reapDocuments(NODE_INVOICE_PDF_RETENTION_DAYS * DAY_MS)` and logs `checked` and `reaped` counts. Sets `connectFirst: false`, because the sweep never touches Mongo (only the outcome record does).
  - **`reapInvoices`** — calls `eraseDueBuyers()` and logs the returned result under "Invoice buyer blocks erased."
- Each entry spreads its base declaration from `invoicingJobData` (imported from `./jobs.generated`) and adds the `run` function.

## Relationships
- `src/kernel/registry.ts` — provides the `JobDeclaration` type that the exported array conforms to.
- `src/infrastructure/adapters/document-store.ts` — `reapDocuments` does the stored-PDF sweep.
- `src/infrastructure/adapters/logger.ts` — the `logger` used to report the outcome of each run.
- `src/modules/invoicing/config.ts` — `invoicingConfig().NODE_INVOICE_PDF_RETENTION_DAYS` sets the PDF retention window.
- `src/modules/invoicing/services/retention.ts` — `eraseDueBuyers` implements the buyer-block erasure.
- `src/domain-primitives/time.ts` — `DAY_MS` converts retention days to milliseconds.
- `src/modules/invoicing/module.ts` is a graph neighbor, but this file does not import it. Any link between them is not visible here.

## Notes
- A retention of zero days means a window of nothing, so every stored PDF is reaped.
- The retention config is read inside `run`, on each invocation, not at module load.
- Only `reapInvoicePdfs` sets `connectFirst`. `reapInvoices` leaves it unset, so any default or inherited value comes from elsewhere and is not visible here.
