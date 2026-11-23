---
source: src/modules/inventory/jobs.ts
source_sha256: 50fe6a856801b13d4408fec9a33587b11204a5ac1bbcb54a3790a2e75797de65
context_sha256: 77f89f4c0fca084e73ef06977f15cec80c7ea0597a2bb09588737e9a7d9446c7
generated_at: 2026-11-22T05:19:09.044048+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/jobs.ts

## Purpose
Declares the scheduled jobs owned by the `inventory` module. Currently this is a single job: the stale-hold drain, which sweeps reservations. The file only declares the job. The work itself lives in the sweep service.

## Key elements
- `inventoryJobs`: a `readonly JobDeclaration[]` with one entry.
  - It spreads `inventoryJobData.sweepReservations`, imported from `./jobs.generated`, so the job's base fields come from generated data. This page does not say which fields those are.
  - `run` calls `runReservationSweep()`.
  - `lease: { ttlMs: 10 * MINUTE_MS }` sets a 10-minute lease.

## Relationships
- `src/kernel/registry.ts`: provides the `JobDeclaration` type (type-only import) that each entry must satisfy.
- `src/modules/inventory/services/sweep.ts`: provides `runReservationSweep`, which the job's `run` calls.
- `src/domain-primitives/time.ts`: provides `MINUTE_MS`, used to compute the lease TTL.
- `src/modules/inventory/module.ts`: a graph neighbor, but this file doesn't import it. The module presumably consumes `inventoryJobs`, though that isn't visible here.

## Notes
- The lease stops two drains from running at once. A drain can outlast the five-minute tick, and concurrent drains would fight over the same claims.
- The 10-minute TTL is meant to be longer than a drain of 10,000 holds takes.
- The five-minute schedule is not set in this file. It presumably comes from the generated data.
