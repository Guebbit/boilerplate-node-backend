---
source: src/modules/orders/domain/fulfillment.ts
sha256: afac19d602dd958118812c83d94596994114467fa9ee4ceae946376b010bec1a
generated_at: 2026-11-08T06:48:39.285419+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/domain/fulfillment.ts

## Purpose

Defines the `FulfillmentSummary` record that the `delivery` module writes onto an order, plus pure helper functions that `orders` uses to interpret that record. Because the dependency arrow runs `delivery → orders` (not the reverse), `orders` cannot ask `delivery` directly; instead `delivery` reports state through this one small record (written only via `orderService.recordFulfillmentProgress`), and everything `orders` needs to know about the goods is read off it here.

## Key elements

- **`FulfillmentSummary`** (interface) — the shape of the goods state: `shipped`, `remaining`, `onHold`, `awaitingStock`, `undelivered`, `lastDeliveredAt?`.
- **`NO_FULFILLMENT`** — frozen zero-state constant used as the default when an order has no fulfillment orders yet.
- **`shipsAwaitedStock(to, summary?)`** — pure guard: `true` if moving to `shipped`/`delivered` would ship units whose stock has not arrived. Used by the override flow to refuse invalid moves.
- **`fulfillmentStatusOf(status, summary?)`** — derives the order's `OrderFulfillmentStatus` from its stored status + summary using a first-match-wins table (per-status trait value → `partially_fulfilled` → `on_hold` → trait value).
- **`FulfillmentFilter`** (type) — `Readonly<Record<string, unknown>>`; keeps the domain free of any Mongo-driver import.
- **`fulfillmentStatusFilter(wanted)`** — builds the Mongo `$and`/`$or` filter behind `GET /orders?fulfillmentStatus=`. Derived from the same `ORDER_STATUS_TRAITS` table that `fulfillmentStatusOf` reads, so the filter and the serialized value for a row cannot disagree.
- **`PARTIALLY_SHIPPED` / `EVERY_UNIT_HELD`** (internal constants) — reusable sub-filters for the two summary-refined cases.
- **`everyRemainingUnitHeld`** (private, non-exported) — checks `!shipped && remaining > 0 && remaining === onHold`.

## Relationships

- **`src/modules/orders/domain/status-traits.ts`** — imports `ORDER_STATUS_TRAITS` and `statusesWhere`; the per-status `fulfillment` trait (value + `followsSummary`) drives both `fulfillmentStatusOf` and `fulfillmentStatusFilter`.
- **`src/types/index.ts`** — imports `OrderStatus` and `OrderFulfillmentStatus` used throughout.
- **`src/modules/orders/domain/index.ts`** — barrel re-export; this module's public API surfaces through the domain index.
- **`src/modules/orders/services/override.ts`** — calls `shipsAwaitedStock` as a consistency guard before allowing a status override.
- **`src/modules/orders/services/read.ts`** — passes `fulfillmentStatusFilter` into the order-listing query.
- **`src/modules/orders/tests/unit/fulfillment.test.ts`** / **`src/modules/orders/tests/integration/fulfillment-filter.test.ts`** — unit and integration tests for the helpers and the Mongo filter respectively.

## Notes

- **Pure / no I/O.** All exports are side-effect-free functions or data. The only "I/O" shape (the Mongo filter) is plain JSON, so the module never imports a driver.
- **Write path is external.** This file never mutates the summary; `delivery` recomputes it in the same transaction as its own writes, guaranteeing a stale read cannot overwrite a newer one.
- **`NO_FULFILLMENT` is frozen** — treat as immutable; do not spread-and-mutate.
- **`everyRemainingUnitHeld` is deliberately non-exported**; only `fulfillmentStatusOf` and `fulfillmentStatusFilter` expose the `on_hold` logic externally.
- **Filter ↔ serializer invariant.** `fulfillmentStatusFilter` and `fulfillmentStatusOf` are both derived from `ORDER_STATUS_TRAITS`. Adding a new `OrderStatus` or `OrderFulfillmentStatus` requires updating `status-traits.ts` first; both sides pick it up automatically.
