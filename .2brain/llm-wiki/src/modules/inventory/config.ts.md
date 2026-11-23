---
source: src/modules/inventory/config.ts
source_sha256: aa3deeae973981fd3f2e910063f5a353d481ddb8df6e5cd07e523a5d328aa01d
context_sha256: e9893dde6d66dbfad3f8fb78549a8ff9f50b53fa6fe0dba6259d72bcd486cbb8
generated_at: 2026-11-22T05:16:31.351614+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/config.ts

## Purpose
Defines the tunable numbers the inventory module uses for stock, and exposes them through small accessor functions. Values are read on each call rather than captured at import, so tests can vary them per case. The process environment is fixed at start, so a deployment changes them by restarting.

## Key elements
- `inventoryConfig`: a config built with `defineConfig` (name `'inventory'`). Its shape has one field, `NODE_RESERVATION_TTL_MINUTES`, an `int` with default `15` and minimum `0`.
- `reservationTtlMinutes()`: returns `NODE_RESERVATION_TTL_MINUTES`, the number of minutes a hold survives without payment.
- `lowStockThreshold()`: returns `NODE_LOW_STOCK_THRESHOLD` from the infrastructure `stockConfig`. This is the availability at or under which a product wants restocking.

## Relationships
- `src/infrastructure/config/define.ts` supplies `defineConfig`, and `src/infrastructure/config/fields.ts` supplies the `int` field builder.
- `src/infrastructure/runtime/config.ts` supplies `stockConfig`. The restock threshold is owned there, not here, and `products` reads it too.
- The file is a neighbor of `src/modules/inventory/module.ts`, `src/modules/inventory/services/levels.ts` and `src/modules/inventory/services/reserve.ts`. Their usage is not visible in this file.

## Notes
- The reservation TTL is stamped at reserve time. A change applies only to new checkouts, and holds already made keep their original window.
- `lowStockThreshold` is deliberately shared by two readers that count different populations. The stock board spans the whole catalogue and the gauge covers only public products, so their counts won't match, and that is intended.
