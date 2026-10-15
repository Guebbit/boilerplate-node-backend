---
source: src/modules/inventory/config.ts
sha256: c3bb2adbe6a2e21f658c6eccdd7fbc23c31df97262e48944b37845f399085e49
generated_at: 2026-10-15T10:33:35.188064+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/config.ts

## Purpose

Defines the deployment-tunable numbers for inventory stock behavior (reservation TTL, low-stock threshold). Values are exposed as per-call function reads rather than import-time constants so individual tests can vary them case-by-case, while a live deployment changes them via env vars + restart.

## Key elements

- **`inventoryConfig`** — A `defineConfig` block named `inventory` with one field: `NODE_RESERVATION_TTL_MINUTES` (integer, default 15, min 0). Holds any inventory-local tunables.
- **`reservationTtlMinutes(): number`** — Reads `NODE_RESERVATION_TTL_MINUTES` from `inventoryConfig`. Returns the hold window (minutes) a reserved item survives before the hold expires without payment.
- **`lowStockThreshold(): number`** — Reads `NODE_LOW_STOCK_THRESHOLD` from the infrastructure-level `stockConfig`. Returns the availability level at or below which a product is flagged for restocking.

## Relationships

- **`src/infrastructure/config/define.ts`** — Provides the `defineConfig` factory used to declare `inventoryConfig`.
- **`src/infrastructure/config/fields.ts`** — Provides the `int` field descriptor (with `default`/`min`) used inside the shape.
- **`src/infrastructure/runtime/config.ts`** — Source of `stockConfig`; `lowStockThreshold` delegates to it. `stockConfig` is shared with the `products` module (see `module.ts`).
- **`src/modules/inventory/module.ts`** — Consumes the config exports (and `stockConfig`) to wire inventory services.
- **`src/modules/inventory/services/reserve.ts`** — Calls `reservationTtlMinutes()` to stamp the TTL on a new reservation.
- **`src/modules/inventory/services/levels.ts`** — Calls `lowStockThreshold()` to determine restock flags.

## Notes

- `lowStockThreshold` intentionally reads from the **infrastructure** `stockConfig`, not from `inventoryConfig`. Two modules (`inventory` and `products`) read the same mark but count different populations (whole catalogue vs. public products only), so their derived counts are expected to differ.
- `reservationTtlMinutes` is stamped at reserve time; a deployment change to the env var affects only *new* checkouts, not holds already in flight.
- The per-call read pattern (function, not `const`) is the testability contract — do not refactor these to module-level constants.
