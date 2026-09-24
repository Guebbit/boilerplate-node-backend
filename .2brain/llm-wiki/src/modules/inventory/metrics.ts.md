---
source: src/modules/inventory/metrics.ts
sha256: c2ec875db2338cae4787490aa91edc7b292462dc967ef66b9d0a958b238c47b8
generated_at: 2026-09-23T18:44:53.338077+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/metrics.ts

## Purpose

Declares the two domain gauges the inventory module owns and registers them with the shared Prometheus registry. The file has no exported API; importing it for its side effects is the entire point.

## Key elements

- **`_productsLowStockTotal`** (`Gauge`, name `products_low_stock_total`) — Async `collect` calls `lowStockCount()` from `./service` at scrape time. Reports products whose *available* units (on-hand minus reserved) are at or under the low-stock threshold.
- **`_inventoryReservedUnitsTotal`** (`Gauge`, name `inventory_reserved_units_total`) — Async `collect` calls `stockLevelRepository.sumReserved()` at scrape time. Reports total units held by open (unpaid) reservations across the catalogue.

## Relationships

- **`src/infrastructure/observability/metrics-registry.ts`** — Both gauges pass `metricsRegistry` as their `registers` array, so all series land in the single shared registry the overview endpoint scrapes.
- **`src/modules/inventory/service.ts`** — Supplies `lowStockCount`, the function that computes the low-stock gauge's value by combining this module's own counters with `products`' visibility rule.
- **`src/modules/inventory/repository.ts`** — Supplies `stockLevelRepository.sumReserved()`, the data source for the reserved-units gauge.
- **`src/modules/inventory/module.ts`** — Imports this file purely for the registration side effect; no handles are read back.

## Notes

- The underscore-prefixed bindings (`_productsLowStockTotal`, `_inventoryReservedUnitsTotal`) are intentional. The constructors register the gauges as a side effect; the variables are never dereferenced. Follow the same pattern if you add a third gauge.
- Both `collect` callbacks are **async**. If you add a new gauge here, keep `collect` synchronous unless the underlying data source is genuinely async — `prom-client` awaits it, but a slow or failing collector will stall the entire scrape.
- The low-stock gauge deliberately tracks *availability*, not raw `onHand`. A product with 40 units all reserved reads as low-stock (0 available), not as well-stocked. Don't "simplify" the collect to a plain `sumOnHand`.
