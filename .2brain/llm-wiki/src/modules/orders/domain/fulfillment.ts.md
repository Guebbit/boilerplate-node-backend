---
source: src/modules/orders/domain/fulfillment.ts
sha256: 621036aeb10efe648355b74180afe1f0598e250263fa6cb66529d4fee1c9bf26
generated_at: 2026-10-15T11:01:21.842310+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/domain/fulfillment.ts

## Purpose

Defines the `FulfillmentSummary` record that `delivery` writes into an order (via `orderService.recordFulfillmentProgress`) and the pure read-side logic `orders` uses to interpret it: deriving the displayed fulfillment status and building the Mongo filter for `GET /orders?fulfillmentStatus=`. It exists because the dependency arrow points `delivery → orders`, so `orders` cannot import `delivery` directly and instead consumes this single small record. No I/O.

## Key elements

- **`FulfillmentSummary`** — interface with `shipped`, `remaining`, `onHold`, `awaitingStock`, `undelivered`, `lastDeliveredAt?`. Written atomically with the fulfillment-order changes in the same transaction.
- **`NO_FULFILLMENT`** — frozen constant (all-zero / `shipped: false`) used as the default when an order has no fulfillment orders yet.
- **`shipsAwaitedStock(to, summary?)`** — consistency guard: returns `true` if moving to `shipped`/`delivered` would ship units still awaiting stock. Single source of truth for the override door and the override menu.
- **`everyRemainingUnitHeld(summary)`** — (module-private) helper: `!shipped && remaining > 0 && remaining === onHold`.
- **`fulfillmentStatusOf(status, summary?)`** — derives `OrderFulfillmentStatus` from the stored status + summary using a first-match-wins table (4 rows). Statuses whose trait has `followsSummary: false` short-circuit to their trait value.
- **`FulfillmentFilter`** — `Readonly<Record<string, unknown>>`, a plain-data type so the domain layer never imports a Mongo driver.
- **`fulfillmentStatusFilter(wanted)`** — builds the Mongo filter that selects rows whose `fulfillmentStatusOf` would return `wanted`. Derived from the same `ORDER_STATUS_TRAITS` table, so the filter and the serialized value cannot disagree.

## Relationships

- **`@types`** (`src/types/index.ts`) — imports `OrderStatus` (value) and `OrderFulfillmentStatus` (type).
- **`./status-traits`** — imports `ORDER_STATUS_TRAITS` and `statusesWhere` to look up per-status fulfillment traits and select matching statuses for filter construction.
- **`domain/index.ts`** — barrel re-exports the public API of this file (`FulfillmentSummary`, `NO_FULFILLMENT`, `shipsAwaitedStock`, `fulfillmentStatusOf`, `FulfillmentFilter`, `fulfillmentStatusFilter`).
- **`services/fulfillment.ts`** — the write path: recomputes the summary and persists it via `orderService.recordFulfillmentProgress`.
- **`services/override.ts`** — calls `shipsAwaitedStock` as its single consistency guard; the override menu and the override door both consult this one boolean.
- **`services/read.ts`** — calls `fulfillmentStatusFilter` to build the query for the fulfillment-status listing endpoint.
- **`model.ts`** — the order document type that carries the `FulfillmentSummary` field the filter targets (`fulfillment.*` paths).
- **`repository.ts`** — applies the `FulfillmentFilter` objects to the database.
- **`tests/unit/fulfillment.test.ts`** — unit-tests `fulfillmentStatusOf`, `shipsAwaitedStock`, and `NO_FULFILLMENT`.
- **`tests/integration/fulfillment-filter.test.ts`** — integration-tests `fulfillmentStatusFilter` against a real Mongo instance.

## Notes

- The `FulfillmentFilter` type is deliberately `Readonly<Record<string, unknown>>` rather than a Mongoose/`mongodb`-typed object, keeping the domain module free of driver imports.
- `PARTIALLY_SHIPPED` and `EVERY_UNIT_HELD` are module-private filter fragments used only inside `fulfillmentStatusFilter`; they encode rows 2 and 3 of the `fulfillmentStatusOf` table in query form.
- `fulfillmentStatusFilter('unfulfilled')` is the only case that uses `$or` across both `followsSummary: false` and `followsSummary: true` branches, because `unfulfilled` is the trait value for both `paid` (follows) and one non-following status.
- The summary is written in the same transaction as the fulfillment-order mutation, so a stale read cannot overwrite a newer one (noted in the `FulfillmentSummary` JSDoc).
