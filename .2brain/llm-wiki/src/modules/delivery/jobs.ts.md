---
source: src/modules/delivery/jobs.ts
sha256: 6488ad670afcbdc42e311508f8f0ad47666776f185205a52cbe145a8d650c722
generated_at: 2026-11-14T19:40:52.681592+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/jobs.ts

## Purpose

Declares the two scheduled jobs owned by the `delivery` module—a delivery reaping job and a daily preorder sweep—by wrapping domain service calls into `JobDeclaration` objects that the kernel registry can schedule.

## Key elements

- **`deliveryJobs`** (export) — `readonly JobDeclaration[]` with two entries:
  - **`reapDelivery`** — runs `scrubHoldNotes()` and `scrubLostNotes()` concurrently via `Promise.all`; returns the combined count of purged notes.
  - **`sweepPreorders`** — runs `runPreorderSweep()`, logs the result via `logger.info`, and sets a 30-minute lease TTL (`30 * MINUTE_MS`).
- Both entries spread pre-generated metadata from `./jobs.generated` (`deliveryJobData.reapDelivery`, `deliveryJobData.sweepPreorders`) to pick up names, schedules, and other config without hard-coding them here.

## Relationships

- **`src/kernel/registry.ts`** — consumes the `JobDeclaration` type to shape the exported array.
- **`src/modules/delivery/services/retention.ts`** — provides `scrubHoldNotes` and `scrubLostNotes`, the work performed by the `reapDelivery` job.
- **`src/modules/delivery/services/preorder-sweep.ts`** — provides `runPreorderSweep`, the work performed by the `sweepPreorders` job.
- **`src/infrastructure/adapters/logger.ts`** — structured logging of the preorder sweep result.
- **`src/domain-primitives/time.ts`** — supplies `MINUTE_MS` for the lease TTL calculation.
- **`src/modules/delivery/module.ts`** — registers `deliveryJobs` with the kernel (the module's wiring point).

## Notes

- The `reapDelivery` job has **no explicit lease TTL**, while `sweepPreorders` does (30 min). If the kernel enforces a default lease, the two jobs may behave differently under timeout conditions.
- Job metadata (schedule cron, name, etc.) lives in `jobs.generated`, not in this file. Changing cadence or identifiers requires regenerating that file rather than editing here.
- `deliveryJobs` is typed as `readonly`; consumers must not mutate the array or its elements at runtime.
