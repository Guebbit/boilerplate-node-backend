---
source: src/modules/webhooks/jobs.ts
sha256: 32885eff863a1899d8ed5ee03ea0aed5c8693176e3b42ad085f8655fd571c58e
generated_at: 2026-11-14T22:42:51.867219+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/jobs.ts

## Purpose
Declares the scheduled jobs owned by the `webhooks` module. Currently owns a single job — the webhook delivery retry sweep — by pairing a generated job descriptor with its handler function and exporting the result as a `JobDeclaration[]` for the kernel to schedule.

## Key elements
- **`webhooksJobs`** (export, `readonly JobDeclaration[]`) — The array of jobs this module registers. Contains one entry: `sweepWebhookRetries`, whose `run` delegates to `sweepDueWebhookDeliveries()`.
- **`webhooksJobData`** (import from `./jobs.generated`) — Pre-generated static job metadata (id, name, schedule, etc.) spread into each declaration so scheduling config stays out of hand-written code.

## Relationships
- **`src/kernel/registry.ts`** — Source of the `JobDeclaration` type used to type `webhooksJobs`; the kernel consumes this array to know what to schedule.
- **`src/modules/webhooks/services/sweep.ts`** — Provides `sweepDueWebhookDeliveries`, the actual work executed when the job fires.
- **`src/modules/webhooks/module.ts`** — The module entry point that is expected to reference `webhooksJobs` so the kernel discovers the job.
- **`tests/integration/ops-webhook-retry-job.test.ts`** — Integration test that exercises the retry-sweep job end-to-end.

## Notes
- Job metadata lives in `jobs.generated.ts`, not here. Adding a new job means adding a new key in the generated file *and* a new spread entry in this array.
- The `run` field is a zero-arg closure; the sweep service handles its own argument passing internally.
- The array is typed `readonly` — consumers must not mutate it.
