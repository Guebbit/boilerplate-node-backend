---
source: src/modules/inventory/jobs.ts
sha256: 689e0efa25035868146d3e94f41da6fe3edb8f68298499caeb67213d0083341d
generated_at: 2026-10-29T04:00:51.833975+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/jobs.ts

## Purpose

Declares the scheduled jobs owned by the `inventory` module. Currently exposes a single job — the stale-hold drain (reservation sweep) — as a typed `JobDeclaration[]` for the scheduler to pick up.

## Key elements

- **`inventoryJobs: readonly JobDeclaration[]`** — the module's job registry. Contains one entry:
  - **`sweepReservations`** — base metadata spread from `inventoryJobData.sweepReservations` (generated file), then overridden with:
    - `run` — calls `runReservationSweep()`, then `settleOutboxNudges()`.
    - `needs` — requires `subscriptions` and `i18n` to be available.
    - `lease.ttlMs` — 10 minutes (overrides the default tick window).

## Relationships

- **`src/kernel/registry.ts`** — provides the `JobDeclaration` type that shapes every entry in `inventoryJobs`.
- **`src/modules/inventory/jobs.generated.ts`** — supplies the static job metadata (`inventoryJobData.sweepReservations`) that is spread into the declaration.
- **`src/modules/inventory/services/sweep.ts`** — `runReservationSweep` is the actual work performed by the job.
- **`src/kernel/outbox.ts`** — `settleOutboxNudges` is invoked immediately after the sweep to flush outbox announcements within the same lease.
- **`src/modules/inventory/module.ts`** — consumes `inventoryJobs` to register the module's jobs with the scheduler.

## Notes

- The 10-minute lease is deliberately longer than the 5-minute scheduler tick: a drain of ~10 000 holds can outlast one tick, and two concurrent drains would race over the same claims.
- `settleOutboxNudges()` runs *inside* the lease (after the sweep resolves) so the `orders` module has processed every expiry announcement before the job's connections close.
