---
source: src/modules/webhooks/jobs.ts
sha256: 3aa72e9221183add8369ce60c0942632f06675bdf08a131c910e3f3ca61c0478
generated_at: 2026-11-08T09:03:05.642941+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/jobs.ts

## Purpose

Declares the scheduled jobs owned by the `webhooks` module. Currently exposes a single job (`sweepWebhookRetries`) that triggers the delivery-retry sweep on a schedule.

## Key elements

- **`webhooksJobs: readonly JobDeclaration[]`** – The module's job manifest. Each entry spreads generated metadata from `./jobs.generated` and wires the runtime.
- **`sweepWebhookRetries` entry** – `run` calls `sweepDueWebhookDeliveries()`; `needs` declares soft dependencies on `subscriptions` and `i18n` (required for the auto-disable → notification → translated staff-mail flow).

## Relationships

- **`src/kernel/registry.ts`** – Supplies the `JobDeclaration` type that shapes each entry in `webhooksJobs`.
- **`src/modules/webhooks/module.ts`** – Parent module that registers/exposes `webhooksJobs` into the kernel's job table.
- **`src/modules/webhooks/services/sweep.ts`** – Implements `sweepDueWebhookDeliveries`, the actual work performed when the job fires.
- **`tests/integration/ops-webhook-retry-job.test.ts`** – Integration test that exercises this job end-to-end.

## Notes

- The `needs` field is a *runtime* dependency gate (not a build-time import). If `subscriptions` or `i18n` are not loaded, the job will not execute.
- The auto-disable side-effect (emitting `webhook.subscription_auto_disabled` during a sweep) is an implicit coupling to the `notifications` module; it is not an import here but is documented in the inline comment to aid future readers.
- Job metadata (schedule, name, etc.) lives in `./jobs.generated`; this file only wires metadata to the execution function and declares dependencies.
