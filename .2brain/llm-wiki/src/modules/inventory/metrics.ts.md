---
source: src/modules/inventory/metrics.ts
sha256: 60c361347cf79b6cd03ac6c219cce44b51cdf4c6f473b239b857ca1945ab4db9
generated_at: 2026-10-29T04:00:59.968354+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/metrics.ts

## Purpose

Defines the two Prometheus gauges that the inventory module owns and registers into the shared `metricsRegistry`. The file exists so that gauge registration is a pure side-effect import (bound to underscore-prefixed variables) and so the overview endpoint can read the metrics without creating a dependency back into this module.

## Key elements

- **`_productsLowStockTotal`** (`Gauge`, metric name `products_low_stock_total`) — Reports how many products are at or under the low-stock threshold. Value is computed at scrape time via an async `collect()` callback that calls `inventoryService.lowStockCount()`. Counts *availability*, not raw units on hand.
- **`_inventoryReservedUnitsTotal`** (`Gauge`, metric name `inventory_reserved_units_total`) — Reports total units currently held by open (unpaid) reservations across the catalogue. Computed at scrape time via `stockLevelRepository.sumReserved()`.

Both gauges are intentionally bound to `_`-prefixed locals; nothing imports or reads the handles. Registration into `metricsRegistry` in the constructor is the entire job.

## Relationships

- **`src/infrastructure/observability/metrics-registry.ts`** — Supplies the shared `metricsRegistry` instance that both gauges register into (passed as the `registers` array).
- **`src/modules/inventory/services/index.ts`** — Provides `inventoryService.lowStockCount()`, the data source for `products_low_stock_total`.
- **`src/modules/inventory/repository.ts`** — Provides `stockLevelRepository.sumReserved()`, the data source for `inventory_reserved_units_total`.
- **`src/modules/inventory/module.ts`** — Expected to import this file for its side effect (gauge registration) without referencing the underscored exports.

## Notes

- The module docblock points to `modules/account/metrics.ts` as the canonical example of *why* domain gauges live in the module rather than in `infrastructure`, and to `docs/modules/inventory.md` for broader context.
- `products_low_stock_total` measures availability, not `onHand`: a product with 40 units all reserved reads as **0** available here, so comparing this gauge against a simple `on_hand` counter will look inconsistent by design.
- A steadily rising `inventory_reserved_units_total` with flat sales is an alert signal for abandoned checkouts or a stalled payment-confirmation flow.
