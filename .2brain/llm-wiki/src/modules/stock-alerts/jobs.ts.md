---
source: src/modules/stock-alerts/jobs.ts
generated_at: 2026-11-22T07:54:26.035257+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/stock-alerts/jobs.ts

## Purpose
Declares the scheduled jobs owned by the `stock-alerts` module. It defines a single job that runs every five minutes (per the module doc) to answer pending requests for products that are no longer `out_of_stock`.

## Key elements
- `stockAlertsJobs` — read-only array of `JobDeclaration` exported for the module. It contains one entry:
  - Spreads `stockAlertsJobData.sweepStockAlerts` (from the generated `./jobs.generated`), which supplies the job's declarative data.
  - `run` calls `stockAlertService.sweepBuyable()` and logs `'Stock alert sweep done.'` with the returned `products` via `logger.info`.
  - `lease: { ttlMs: 30 * MINUTE_MS }` sets a 30-minute lease TTL.

## Relationships
- `src/kernel/registry.ts` — provides the `JobDeclaration` type that the array conforms to.
- `src/modules/stock-alerts/service.ts` — exports `stockAlertService`, whose `sweepBuyable()` method is called by the job's `run`.
- `src/infrastructure/adapters/logger.ts` — `logger` records the sweep result.
- `src/domain-primitives/time.ts` — `MINUTE_MS` is used to compute the lease TTL.
- `src/modules/stock-alerts/module.ts` — a graph neighbor of this file. This file's content does not show how the two interact.

## Notes
- The schedule and job identity come from the generated `jobs.generated` file, not from this file; this file only adds `run` and `lease`.
- The 30-minute lease is much longer than the five-minute cadence described in the module doc.
- The module doc points to `docs/reference/ops.md#scheduled-jobs` for operational details.
