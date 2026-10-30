---
source: src/modules/stock-alerts/jobs.ts
sha256: 6e767b3f847b55fa5ad68c6b10764fc633bca46b6b63a2da3f8752c60735bc5c
generated_at: 2026-10-29T05:58:30.772612+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stock-alerts/jobs.ts

## Purpose

Declares the scheduled job(s) owned by the `stock-alerts` module. The single job performs the hourly "sweep" that converts preorders whose release date has passed into buyable products, then flushes any resulting notifications through the outbox before the lease expires.

## Key elements

- **`stockAlertsJobs`** (`readonly JobDeclaration[]`) — the module's job registry, consumed by the job scheduler. Contains one entry:
  - **`sweepStockAlerts`** — spreads metadata from `stockAlertsJobData.sweepStockAlerts` and supplies:
    - `run` — calls `stockAlertService.sweepBuyable(new Date())`, logs the resulting product list, then awaits `settleOutboxNudges()` so notifications are delivered before the connection pool closes.
    - `needs` — `{ subscriptions: true, i18n: true }`; the scheduler must provision these dependencies before the job starts.
    - `lease` — `{ ttlMs: 30 * 60 * 1000 }` (30 min max lease).

## Relationships

- **`jobs.generated.ts`** — provides the static job metadata (`id`, `cron`, display name, etc.) that is spread into the declaration at runtime. This file only supplies `run`, `needs`, and `lease`.
- **`service.ts`** — `stockAlertService.sweepBuyable` performs the actual DB read/write that flips preorders to buyable.
- **`kernel/outbox.ts`** — `settleOutboxNudges()` is the final step in `run`; it guarantees all inbox rows produced by the sweep are settled before the lease window closes.
- **`infrastructure/adapters/logger.ts`** — structured logging of the sweep result (product list) for observability.
- **`kernel/registry.ts`** — source of the `JobDeclaration` type that shapes the export.
- **`module.ts`** — the module boundary that registers `stockAlertsJobs` with the kernel scheduler.

## Notes

- The outbox settle is intentionally chained **inside** the `run` promise (not fired-and-forgotten) so that the 30-minute lease is only released after every notification has been dispatched. Removing it to a separate `.fire` would risk closing connections before `notifications` consumes its inbox.
- `needs` is a capability gate: the scheduler will not schedule the job until both `subscriptions` and `i18n` adapters are ready.
- The job is idempotent by design (it queries by release date + current time), so overlapping leases after a crash are safe.
