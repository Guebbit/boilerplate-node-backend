# src/modules/inventory/metrics.ts

## Purpose

Defines two Prometheus `Gauge` metrics that the inventory module owns: one tracking low-availability product count and one tracking total reserved units. The file is imported purely for its side effect of registering the gauges; no consumer reads the exported (underscore-prefixed) variables.

## Key elements

- **`_productsLowStockTotal`** — `Gauge` named `products_low_stock_total`. Its `collect` callback calls `productRepository.countLowAvailability(lowStockThreshold())` at scrape time to count products whose *available* units (on-hand minus reserved) are at or below the configured threshold.
- **`_inventoryReservedUnitsTotal`** — `Gauge` named `inventory_reserved_units_total`. Its `collect` callback calls `productRepository.sumReserved()` to sum units currently held by open reservations.
- Both gauges register into the shared `metricsRegistry` and rely on `async collect()` rather than a static value, so the underlying query runs on each Prometheus scrape.

## Relationships

- **`src/infrastructure/observability/metrics-http.ts`** — Supplies the shared `metricsRegistry` into which both gauges register.
- **`src/modules/products/index.ts`** — Re-exports `productRepository`, which is the sole data source for both gauge `collect` callbacks.
- **`src/modules/products/repository.ts`** — Implements `countLowAvailability` and `sumReserved` (the two methods actually awaited by this file, reached via the index re-export).
- **`src/modules/inventory/config.ts`** — Provides `lowStockThreshold()`, read inside the low-stock gauge's `collect` to pass the current threshold to the repository query.
- **`src/modules/inventory/module.ts`** — Sibling entry point in the same module; this file is expected to be imported for its registration side effect (no symbol is consumed).

## Notes

- The underscore-prefixed bindings (`_productsLowStockTotal`, `_inventoryReservedUnitsTotal`) are intentionally never read; the constructor is the only work done. Linters that flag unused variables should be configured to tolerate this pattern (same convention as `metrics-http.ts`).
- The low-stock gauge measures **availability**, not `onHand`. A product with units on hand but fully reserved reports as low/out of stock. Do not replace the query with a simpler `onHand <= threshold` check.
- Because `collect` is `async`, a failing database query during a scrape will surface as a metric-collection error in Prometheus rather than throwing in-process.
