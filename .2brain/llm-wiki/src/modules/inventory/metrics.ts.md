---
source: src/modules/inventory/metrics.ts
sha256: c96dd09b71dffd561977e243491dad3d33ce577ea9682d30e693fbbb3cfd944c
generated_at: 2026-10-15T10:34:54.523568+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/metrics.ts

## Purpose
Defines the inventory module's owned Prometheus gauges and registers them on the shared metrics registry. The file exists as a side-effect module: importing it registers the gauges, and the underscore-prefixed exports are never read. Placing gauges in the module (rather than `infrastructure`) keeps domain semantics local; the overview endpoint reads the values via the shared registry without importing this file.

## Key elements
- **`_productsLowStockTotal`** (Gauge, `products_low_stock_total`) — Async `collect()` that calls `lowStockCount()` at scrape time to report how many products are at or under the low-stock threshold. Measures *availability*, not raw `onHand` units.
- **`_inventoryReservedUnitsTotal`** (Gauge, `inventory_reserved_units_total`) — Async `collect()` that calls `stockLevelRepository.sumReserved()` to report total units held by open (unpaid) reservations.

## Relationships
- **`src/infrastructure/observability/metrics-registry.ts`** — Imports `metricsRegistry` (a `prom-client` Registry instance) to register both gauges.
- **`src/modules/inventory/repository.ts`** — Imports `stockLevelRepository`; calls `sumReserved()` inside the reserved-units gauge's `collect`.
- **`src/modules/inventory/services/index.ts`** — Imports `lowStockCount`; called inside the low-stock gauge's `collect`.
- **`src/modules/inventory/services/levels.ts`** — Implementation home of `lowStockCount`, re-exported through `services/index.ts`.
- **`src/modules/inventory/module.ts`** — Module entry point expected to import this file for its registration side effect (no runtime value read).

## Notes
- Both gauge variables are deliberately prefixed with `_` (unused in TypeScript) to signal "register-only" exports. The same convention is used in `metrics-registry.ts` for its process gauges.
- `collect` callbacks are **async**; Prometheus will await them at scrape time. A slow `lowStockCount()` or `sumReserved()` query delays the entire scrape for this module.
- The low-stock gauge intentionally avoids reporting `onHand`: a product with units fully reserved reads as out-of-stock to customers, so `onHand` would misreport availability.
- The file docblock references `modules/account/metrics.ts` as the sibling pattern and `docs/modules/inventory.md` for broader module context.
