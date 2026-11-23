---
source: src/modules/inventory/metrics.ts
source_sha256: b214682f5502da1e2c35b61852902b7fcfd1b4602791f9fba8a21648d1e5df52
context_sha256: 6fa9ee8b9279ebf2c9cce50b42c8386da570cb0a0c93614885a8ce2b738ca841
generated_at: 2026-11-22T05:19:23.641334+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/metrics.ts

## Purpose
Declares the Prometheus gauges owned by the inventory module and registers them on the shared `metricsRegistry`. The gauges live in the module rather than in `infrastructure` (rationale is in `src/modules/account/metrics.ts`). All values are computed at scrape time through each gauge's `collect()` callback.

## Key elements
- `_productsLowStockTotal` (`products_low_stock_total`): number of products whose available units are at or under the low-stock threshold. It counts availability, not units on hand, so a product whose stock is fully reserved counts as low. Value comes from `inventoryService.lowStockCount()`.
- `_inventoryReservedUnitsTotal` (`inventory_reserved_units_total`): total units held by open reservations, from `stockLevelRepository.sumReserved()`. A total that keeps climbing while sales stay flat points to unresolved holds, such as abandoned checkouts or payment confirmations that stopped arriving.
- `_inventoryOverdueHolds` (`inventory_overdue_holds`): holds still open more than 10 minutes past their deadline, meaning the reservation sweep could not expire them. Value comes from `reservationRepository.countHeldPastDeadline(cutoff)`, where cutoff is `Date.now() - OVERDUE_HOLD_GRACE_MS`.
- `OVERDUE_HOLD_GRACE_MS` (not exported): 10 minutes, twice the 5-minute sweep interval in `docker/crontab`. A single late or still-draining sweep tick doesn't trip the gauge.

## Relationships
- `src/infrastructure/observability/metrics-registry.ts`: provides `metricsRegistry`, which every gauge registers on. Its two process gauges use the same underscore-variable pattern.
- `src/modules/inventory/repository.ts`: provides `stockLevelRepository` (`sumReserved`) and `reservationRepository` (`countHeldPastDeadline`).
- `src/modules/inventory/services/index.ts`: provides `inventoryService`, which this file uses for the low-stock gauge's value. Per the docblock, it combines this module's counters with the `products` module's visibility rule.
- `src/modules/inventory/module.ts` and `src/modules/inventory/tests/integration/service.test.ts`: no interaction is visible in this file.

## Notes
- Each gauge is bound to an unused `_`-prefixed variable. Constructing the `Gauge` registers it, and nothing reads the handle.
- The file exports nothing. It only takes effect if something imports it for its side effects.
- `inventory_overdue_holds` is read from Mongo at scrape time. The sweep runs as a one-shot job in the `cron` container, which Prometheus doesn't scrape, so a counter incremented there would never be seen.
- A hold the sweep can't expire keeps its units reserved. It shows up in `inventory_overdue_holds` on every scrape until someone fixes it.
- The file's docblocks point to further documentation on the pipeline and on holds that keep failing to expire.
