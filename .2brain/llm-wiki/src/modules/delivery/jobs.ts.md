---
source: src/modules/delivery/jobs.ts
sha256: cbbcf7eefc0b2a3284c5808e7fe2518c648d3d63da6550e45d1e75823d2ea3ad
generated_at: 2026-10-29T03:35:02.934879+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/jobs.ts

## Purpose

Declares the two scheduled jobs owned by the `delivery` module—the hold/lost-note scrub and the daily preorder sweep—as a single `JobDeclaration[]` array consumed by the module registration system.

## Key elements

- **`deliveryJobs`** (export, `readonly JobDeclaration[]`) — the sole export; an array of two job objects:
  - **`reapDelivery`** — spreads base data from `deliveryJobData.reapDelivery`, then runs `scrubHoldNotes()` and `scrubLostNotes()` concurrently via `Promise.all` and returns the combined count.
  - **`sweepPreorders`** — spreads base data from `deliveryJobData.sweepPreorders`, runs `runPreorderSweep()`, logs the result, then calls `settleOutboxNudges()`. Declares `needs: { subscriptions: true, i18n: true }` and a 30-minute lease (`ttlMs: 30 * 60 * 1000`).

## Relationships

- **`@kernel/registry`** — provides the `JobDeclaration` type that shapes each job object.
- **`./jobs.generated`** — supplies the pre-generated base data (name, schedule, etc.) spread into each job entry.
- **`./services/retention`** — source of the two scrub functions executed by `reapDelivery`.
- **`./services/preorder-sweep`** — source of `runPreorderSweep`, the main work of the second job.
- **`@kernel/outbox`** — `settleOutboxNudges()` is called after the sweep so that queued notification nudges are dispatched before the lease window closes.
- **`@infrastructure/adapters/logger`** — used to log the sweep result at `info` level.
- **`./module.ts`** — expected consumer of `deliveryJobs` for module registration (import direction: module → this file).

## Notes

- The outbox settlement is intentionally sequenced *after* `runPreorderSweep` resolves but *inside* the lease, ensuring the `notifications` service has acknowledged every nudge before the connections close.
- `deliveryJobData` comes from a generated file (`jobs.generated.ts`); edit the source-of-truth config, not this file, to change job metadata (names, schedules, etc.).
- The `needs` field on `sweepPreorders` signals runtime dependencies (subscriptions, i18n) to the scheduler—missing them will surface at job-execution time, not at import time.
