---
source: src/modules/delivery/jobs.ts
sha256: ca38f57a111e90a215681cbde7f22448362e76d6d3af1ac90617d4135142f250
generated_at: 2026-11-08T05:30:42.260655+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/jobs.ts

## Purpose

Declares the two scheduled jobs owned by the `delivery` module — a retention reaper (hold-note and lost-note scrubbing) and a daily preorder sweep — as a single `JobDeclaration[]` export that the module registry consumes.

## Key elements

- **`deliveryJobs`** (export, `readonly JobDeclaration[]`) — the canonical list of delivery-owned jobs; two entries:
  - **`reapDelivery`** — runs `scrubHoldNotes()` and `scrubLostNotes()` concurrently; resolves to the combined count of scrubbed records.
  - **`sweepPreorders`** — calls `runPreorderSweep()`, logs the result via the shared logger, then calls `settleOutboxNudges()`. Declares `needs: { subscriptions: true, i18n: true }` and a 30-minute lease (`ttlMs: 30 * MINUTE_MS`).

## Relationships

- **`src/kernel/registry.ts`** — provides the `JobDeclaration` type that shapes each job entry.
- **`src/modules/delivery/services/retention.ts`** — supplies `scrubHoldNotes` and `scrubLostNotes` used by the reaper job.
- **`src/modules/delivery/services/preorder-sweep.ts`** — supplies `runPreorderSweep` used by the sweep job.
- **`src/kernel/outbox.ts`** — supplies `settleOutboxNudges`, called after the sweep to finalize pending notifications before the lease expires.
- **`src/infrastructure/adapters/logger.ts`** — provides the `logger` used to emit the sweep-completion log line.
- **`src/domain-primitives/time.ts`** — provides `MINUTE_MS` to express the lease TTL in a unit-agnostic way.
- **`src/modules/delivery/module.ts`** — consumes `deliveryJobs` to register both jobs with the kernel.

## Notes

- Job metadata (IDs, schedules, etc.) is imported from `./jobs.generated`; hand-editing this file only changes the `run` / `needs` / `lease` closures, not the identity of the job.
- The `settleOutboxNudges()` call is intentionally sequenced *inside* the lease window so that every outbox notice is confirmed before connections close — removing or reordering it after the lease would race the notification consumers.
- `needs` is a declarative dependency hint (subscriptions, i18n) that the scheduler resolves before invoking `run`; it is not a runtime import.
