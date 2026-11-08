---
source: src/modules/inventory/jobs.ts
sha256: 74b70c221b31786c79477116b29c1434a6b060dbe945df0c4520f43797a1f0f5
generated_at: 2026-11-08T05:59:24.345472+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/jobs.ts

## Purpose

Declares the scheduled job(s) owned by the `inventory` module — currently a single stale-hold drain (`sweepReservations`). Each entry is a `JobDeclaration` the kernel scheduler picks up; this file is the single source of truth for what `inventory` runs on a schedule and under what lease/dependency constraints.

## Key elements

- **`inventoryJobs`** (export, `readonly JobDeclaration[]`) — The array of job declarations owned by this module. Currently contains one entry:
  - Spreads metadata from `inventoryJobData.sweepReservations` (generated file `./jobs.generated`).
  - `run` — Calls `runReservationSweep()` and, on resolution, `settleOutboxNudges()`, so every expiry announcement is settled before the lease window closes and downstream consumers (e.g. `orders`) have heard them.
  - `needs` — Declares `subscriptions: true` and `i18n: true` as required ambient dependencies.
  - `lease.ttlMs` — Set to `10 * MINUTE_MS`; deliberately longer than the five-minute tick to prevent two concurrent drains from racing over the same claims, and long enough to cover a drain of ~10 000 holds.

## Relationships

- **`src/kernel/registry.ts`** — Imports the `JobDeclaration` type that shapes every entry in `inventoryJobs`.
- **`src/kernel/outbox.ts`** — Imports `settleOutboxNudges`, called after the sweep completes to flush pending notifications within the lease window.
- **`src/modules/inventory/services/sweep.ts`** — Imports `runReservationSweep`, the actual work performed by the job.
- **`src/domain-primitives/time.ts`** — Imports the `MINUTE_MS` constant used to compute the lease TTL.
- **`src/modules/inventory/module.ts`** — The module entry point that registers `inventoryJobs` with the scheduler (consumer of this export).

## Notes

- Job metadata (id, schedule interval, etc.) lives in `jobs.generated`, not in this file. Editing schedule parameters means touching the generator/source, not this declaration.
- The lease TTL is intentionally **not** tied to the tick interval; changing the tick cadence does not require changing `ttlMs`, and vice versa. The only invariant is that the TTL exceeds the worst-case drain duration.
- `settleOutboxNudges()` is sequenced **inside** the lease (via `.then`), not in a separate job. Do not split it out without ensuring `orders` still observes every nudge before its own lease expires.
