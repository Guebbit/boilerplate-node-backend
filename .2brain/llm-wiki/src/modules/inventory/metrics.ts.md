---
source: src/modules/inventory/metrics.ts
sha256: 60c361347cf79b6cd03ac6c219cce44b51cdf4c6f473b239b857ca1945ab4db9
generated_at: 2026-11-08T05:59:34.539373+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/metrics.ts

## Purpose

Declares the Prometheus gauges owned by the inventory module. The gauges self-register into the shared registry at import time; nothing in the codebase imports the gauge handles themselves. Placing them here (in the module) rather than in `infrastructure` keeps ownership local — the same convention used by `modules/account/metrics.ts`.

## Key elements

- **`_productsLowStockTotal`** (`products_low_stock_total`) — Gauge whose `collect()` calls `inventoryService.lowStockCount()` at scrape time. Reports the count of products whose *available* units are at or under the low-stock threshold (availability, not raw `onHand`), so a fully-reserved product correctly reads as out of stock.
- **`_inventoryReservedUnitsTotal`** (`inventory_reserved_units_total`) — Gauge whose `collect()` calls `stockLevelRepository.sumReserved()`. Reports units currently held by open (unpaid) reservations across the catalogue. A climbing trend at flat sales rate signals abandoned checkouts or a stalled payment confirmation path.

Both are bound to underscore-prefixed variables purely to suppress unused-variable warnings; the variables are never read.

## Relationships

- **`src/infrastructure/observability/metrics-registry.ts`** — Provides the `metricsRegistry` instance passed in each gauge's `registers` array. This is what makes the gauges visible to the process-wide scrape endpoint without any consumer importing this file.
- **`src/modules/inventory/repository.ts`** — Exports `stockLevelRepository`; the reserved-units gauge calls its `sumReserved()` during collection.
- **`src/modules/inventory/services/index.ts`** — Exports `inventoryService`; the low-stock gauge calls its `lowStockCount()` during collection.
- **`src/modules/inventory/module.ts`** — The module's overview endpoint surfaces these gauges; it reads them from the shared registry rather than importing this file directly.

## Notes

- The gauges are *pull*-style (`collect` is async and runs at scrape time), not push-style. Do not set values imperatively elsewhere.
- `products_low_stock_total` reflects *availability* (on-hand minus reserved), not raw stock. A product with 40 units all reserved reports as out of stock here.
- The underscore prefix on both variables is intentional — it signals "registration side-effect only, handle unused." Follow the same pattern when adding gauges.
