# src/modules/inventory/config.ts

## Purpose

Centralizes the two deployment-tunable numbers (reservation TTL and low-stock threshold) into a single import point. Both values are read as functions rather than module-level constants so that environment-variable changes take effect on the next call and tests can vary them per case.

## Key elements

- **`reservationTtlMinutes(): number`** — Reads `NODE_RESERVATION_TTL_MINUTES` (default 30, minimum 0). Returns the hold lifetime in minutes; stamped onto each hold at reserve time, so changes affect only new checkouts.
- **`lowStockThreshold(): number`** — Reads `NODE_LOW_STOCK_THRESHOLD` (default 5, minimum 0). Returns the availability level at or below which a product is considered needing restock.

## Relationships

- **`src/infrastructure/runtime/environment.ts`** — Provides `environmentNumber`, the helper both functions call to parse and floor-clamp the env var at runtime.
- **`src/modules/inventory/service.ts`** — Consumes `reservationTtlMinutes` when creating holds and `lowStockThreshold` for its `lowOnly` catalogue-wide filter.
- **`src/modules/inventory/metrics.ts`** — Consumes `lowStockThreshold` to compute `products_low_stock_total` (public-visible products only).

## Notes

- Both exports are **functions, not constants**. Importers must call them (`lowStockThreshold()`) rather than reading a value. This is deliberate: values are re-read per invocation.
- `lowStockThreshold` is intentionally shared by two readers that count **different populations** (full catalogue vs. public-only). The two resulting counts will differ and that is expected — do not "fix" the discrepancy.
- The third argument to `environmentNumber` (`0`) is a minimum bound, not a default; the second argument is the default.
