---
source: src/modules/webhooks/jobs.ts
sha256: 32885eff863a1899d8ed5ee03ea0aed5c8693176e3b42ad085f8655fd571c58e
generated_at: 2026-10-29T06:27:18.220529+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/jobs.ts

## Purpose

Declares the scheduled jobs owned by the `webhooks` module. It wires each generated job definition to its concrete handler function and exports the resulting list for the kernel's job registry to consume.

## Key elements

- **`webhooksJobs`** (`readonly JobDeclaration[]`) — The single export. Currently contains one entry, `sweepWebhookRetries`, whose `run` calls `sweepDueWebhookDeliveries()`.

## Relationships

- **`src/kernel/registry.ts`** — Supplies the `JobDeclaration` type that shapes each entry in `webhooksJobs`.
- **`src/modules/webhooks/jobs.generated.ts`** — Provides `webhooksJobData`, the per-job metadata (name, schedule, etc.) that is spread into each declaration.
- **`src/modules/webhooks/services/sweep.ts`** — Provides `sweepDueWebhookDeliveries`, the actual work executed when the job fires.
- **`src/modules/webhooks/module.ts`** — Consumes `webhooksJobs` to register the module's jobs with the kernel.

## Notes

- Job metadata lives in `jobs.generated.ts`; this file only binds the metadata to a `run` function. Adding a job means adding an entry to the generated file *and* a corresponding `{ ...data, run }` spread here.
- `webhooksJobs` is typed `readonly`; consumers should not mutate the array.
