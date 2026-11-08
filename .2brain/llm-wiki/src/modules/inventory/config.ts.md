---
source: src/modules/inventory/config.ts
sha256: c3bb2adbe6a2e21f658c6eccdd7fbc23c31df97262e48944b37845f399085e49
generated_at: 2026-11-08T05:57:05.931606+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/config.ts

## Purpose

Declares the tunable numbers a deployment sets for stock management (reservation TTL, low-stock threshold) and exposes them as call-time getters rather than import-time constants, so tests can vary them per case.

## Key elements

- **`inventoryConfig`** — A `defineConfig` declaration (`name: 'inventory'`) with a single field: `NODE_RESERVATION_TTL_MINUTES` (`int`, default 15, min 0).
- **`reservationTtlMinutes(): number`** — Reads the current reservation-TTL value from `inventoryConfig()`. Controls how long a stock hold survives without payment.
- **`lowStockThreshold(): number`** — Reads `NODE_LOW_STOCK_THRESHOLD` from the shared `stockConfig`. The availability level at or under which a product is flagged for restocking.

## Relationships

- **`src/infrastructure/config/define.ts`** — Provides `defineConfig`, used to declare the config shape.
- **`src/infrastructure/config/fields.ts`** — Provides the `int` field type used in the shape definition.
- **`src/infrastructure/runtime/config.ts`** — Source of the shared `stockConfig` from which `lowStockThreshold` reads.
- **`src/modules/inventory/module.ts`** — Consumes this file's exports as part of the inventory module wiring.
- **`src/modules/inventory/services/levels.ts`** — Reads `lowStockThreshold` to evaluate stock levels.
- **`src/modules/inventory/services/reserve.ts`** — Reads `reservationTtlMinutes` when stamping a hold.

## Notes

- **Per-call reads, not import-time snapshots.** Both getters call the config function on every invocation. This is intentional: it lets a test mutate the underlying config between cases without re-importing.
- **`lowStockThreshold` is not inventory-owned.** It reads from `stockConfig`, which `products` also consumes. The two readers count different populations (whole catalogue vs. public products only), so their derived numbers will differ by design.
- **TTL changes are forward-looking only.** The reservation timestamp is stamped at reserve time; changing the TTL mid-process affects only new checkouts, not holds already in flight.
- Deployment changes to any of these values require a process restart (environment is fixed at start).
