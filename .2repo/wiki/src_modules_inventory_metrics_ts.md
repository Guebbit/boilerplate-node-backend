# src/modules/inventory/metrics.ts

## Purpose

Defines the two Prometheus gauges the inventory module owns: `products_low_stock_total` and `inventory_reserved_units_total`. Both are scrape-time-computed (via `collect`) so they always reflect the current DB state rather than accumulating events. They live in the module (not infrastructure) so the observability layer never needs to import domain logic back in — the same pattern as `modules/account/metrics.ts`.

## Key elements

- **`productsLowStockTotal`** (Gauge, `products_low_stock_total`) — Count of products whose *available* units (on-hand minus reserved) are at or below `lowStockThreshold()`. Computed at scrape time via `productRepository.countLowAvailability()`. Deliberately measures availability, not raw stock: a product with 40 units all reserved reads as 0 available.
- **`inventoryReservedUnitsTotal`** (Gauge, `inventory_reserved_units_total`) — Total units held by open (unpaid) reservations across the catalogue. Computed at scrape time via `productRepository.sumReserved()`. Intended to surface runaway holds (abandoned checkouts, stuck payment confirmations) that a simple stock counter would hide.

## Relationships

- **`src/infrastructure/observability/metrics-http.ts`** — Provides `metricsRegistry`; both gauges register into it so the shared HTTP `/metrics` endpoint can scrape them without this file knowing about the transport.
- **`src/modules/inventory/config.ts`** — Exports `lowStockThreshold()`, consumed inside `productsLowStockTotal`'s `collect` callback.
- **`src/modules/products/index.ts`** — Re-exports `productRepository`, the sole data source for both gauges.
- **`src/modules/products/repository.ts`** — Implements `countLowAvailability(threshold)` and `sumReserved()` (the two DB queries these gauges delegate to).
- **`src/modules/inventory/module.ts`** — Not imported here. The module wires up this file's exports for the broader module lifecycle, but the dependency direction is one-way (module → metrics, never the reverse).

## Notes

- Both gauges use **`collect()`**, not `inc`/`dec`. The value is always recomputed against the database at scrape time; there is no accumulated state. This avoids drift but means each Prometheus scrape triggers a Mongo query.
- `lowStockThreshold()` is called **inside** `collect`, not at module-load time. If the threshold is environment-variable-backed or configurable at runtime, it will be re-read on every scrape.
- The file header explicitly cross-references `modules/account/metrics.ts` for the placement rationale. If you move or rename this file, keep that comment consistent or the convention explanation is lost.
- `productsLowStockTotal` counts **products**, not units. `inventoryReservedUnitsTotal` counts **units**. They measure different dimensions of the same inventory state.
