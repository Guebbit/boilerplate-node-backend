---
source: src/modules/invoicing/jobs.ts
sha256: 2941c27283815a829d4e9cd1257a39088df27226232e48617bfece0dd9bb928f
generated_at: 2026-11-08T06:11:23.415802+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/jobs.ts

## Purpose
Declares the two scheduled jobs owned by the `invoicing` module — the stored-PDF reaper and the buyer-block reaper — as a single `JobDeclaration` array that the kernel registry can dispatch on a cron schedule.

## Key elements
- **`retentionMs()`** — internal helper; multiplies `invoicingConfig().NODE_INVOICE_PDF_RETENTION_DAYS` by `DAY_MS` to produce the retention window in milliseconds. A zero-day config means *everything* is reaped immediately.
- **`invoicingJobs`** (exported, `readonly JobDeclaration[]`) — the sole public export. Two entries:
  - **`reapInvoicePdfs`** — spreads `invoicingJobData.reapInvoicePdfs` (from `./jobs.generated`) and overrides `run` to call `reapDocuments(retentionMs())` then log the outcome. Sets `connectFirst: false` so the sweep skips opening a Mongo connection before execution.
  - **`reapInvoices`** — spreads `invoicingJobData.reapInvoices` and overrides `run` to call `eraseDueBuyers()` then log the erased count.

## Relationships
- **`src/modules/invoicing/module.ts`** — consumer; imports `invoicingJobs` to register the jobs with the kernel at module boot.
- **`src/kernel/registry.ts`** — provides the `JobDeclaration` type that shapes each entry in `invoicingJobs`.
- **`src/modules/invoicing/config.ts`** — source of `NODE_INVOICE_PDF_RETENTION_DAYS`; the retention window is read lazily via `invoicingConfig()` at job-run time, not at import time.
- **`src/infrastructure/adapters/document-store.ts`** — `reapDocuments()` performs the actual PDF deletion.
- **`src/modules/invoicing/services/retention.ts`** — `eraseDueBuyers()` performs the buyer-block erasure.
- **`src/infrastructure/adapters/logger.ts`** — both jobs log a structured info line after completing.
- **`src/domain-primitives/time.ts`** — provides `DAY_MS` for the retention calculation.

## Notes
- `connectFirst: false` on the PDF reaper is intentional: the sweep only writes an outcome record, so skipping the Mongo connection saves a round-trip. The comment in the file confirms "the sweep never touches Mongo."
- Job metadata (name, schedule, etc.) comes from the generated file `./jobs.generated.ts`; this file only supplies the `run` implementation and the `connectFirst` flag.
- The retention window is resolved inside `retentionMs()` at invocation time, meaning a config change takes effect on the *next* job run without a restart.
