---
source: src/modules/returns/jobs.ts
sha256: b2062f22beedb77518ddd315b0c8ecb2cd7716d5474dbaeb0219c9936d84d390
generated_at: 2026-11-08T07:59:43.493093+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/jobs.ts

## Purpose

Declares the scheduled jobs owned by the `returns` module. Currently exposes a single job — the free-text scrub — as a `JobDeclaration` array that the runtime scheduler can pick up.

## Key elements

- **`returnsJobs`** (export, `readonly JobDeclaration[]`) — The module's job list. Contains one entry built by spreading generated metadata (`returnsJobData.reapReturns`) and binding its `run` handler to `scrubReturnText()`.

## Relationships

- **`src/kernel/registry.ts`** — Supplies the `JobDeclaration` type that shapes each job entry (name, schedule, `run` signature, etc.).
- **`src/modules/returns/module.ts`** — Consumes `returnsJobs` to register the module's jobs with the scheduler.
- **`src/modules/returns/services/retention.ts`** — Provides `scrubReturnText()`, the function the job actually invokes when it fires.

## Notes

- Job metadata (schedule, display name, etc.) is sourced from `./jobs.generated`, a machine-generated file. Edit the generator or its config, not this file, to change scheduling.
- The generated key is `reapReturns`, which is slightly at odds with the "free-text scrub" description; the name is historical, the behavior is the scrub.
- The array is typed `readonly`; do not attempt to mutate it at runtime.
