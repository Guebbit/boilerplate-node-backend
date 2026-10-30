---
source: src/modules/returns/jobs.ts
sha256: b2062f22beedb77518ddd315b0c8ecb2cd7716d5474dbaeb0219c9936d84d390
generated_at: 2026-10-29T05:39:13.662857+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/jobs.ts

## Purpose
Declares the scheduled jobs owned by the `returns` module. Currently there is exactly one: a free-text scrub that reaps stale return records. The file wires together the job's metadata (generated) and its runtime behavior (a service call) into a single `JobDeclaration` list for the scheduler.

## Key elements
- **`returnsJobs: readonly JobDeclaration[]`** — The sole export. An array containing one job declaration whose `run` field calls `scrubReturnText()`. The remaining fields (id, schedule, name, etc.) are spread from `returnsJobData.reapReturns`.

## Relationships
- **`src/kernel/registry.ts`** — Provides the `JobDeclaration` type that shapes each entry in `returnsJobs`.
- **`src/modules/returns/jobs.generated.ts`** — Supplies `returnsJobData.reapReturns` (the static metadata: id, cron schedule, description, etc.) that is spread into the declaration.
- **`src/modules/returns/services/retention.ts`** — Supplies `scrubReturnText`, the function actually executed when the job fires.
- **`src/modules/returns/module.ts`** — Consumes `returnsJobs` to register the job with the application's job runner.

## Notes
- The array is `readonly`; consumers must not mutate it.
- The job's `run` is a zero-argument arrow wrapper around `scrubReturnText()`. If the service's signature ever changes, this call site must be updated here, not in the generated file.
- `returnsJobData` comes from a generated file; regenerate it (rather than hand-editing) when the job's schedule or metadata changes.
