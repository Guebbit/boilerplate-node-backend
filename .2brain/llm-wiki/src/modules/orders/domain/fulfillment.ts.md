---
source: src/modules/orders/domain/fulfillment.ts
sha256: 14f037a50cfe1dfb785b19471e009bf2c0caca39b2b080561b6e8e289c51cc7a
generated_at: 2026-11-14T20:34:21.414572+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/domain/fulfillment.ts

## Purpose

Pure domain logic that interprets the fulfillment summary a `delivery` module writes onto an order. Because the dependency arrow points `orders → delivery` (not the reverse), `orders` cannot inspect fulfillment orders directly; instead `delivery` reports a small record (`FulfillmentSummary`) and this file derives every question `orders` asks about the goods—settlement moves, the user-facing fulfillment status, and the listing filter—from that single record. No I/O.

## Key elements

- **`FulfillmentSummary`** (interface) — The shape of the record `delivery` writes: `shipped`, `remaining`, `onHold`, `awaitingStock`, `undelivered`, `lastDeliveredAt?`.
- **`NO_FULFILLMENT`** (const) — Frozen zero-value used as default when an order has no fulfillment orders yet.
- **`shipsAwaitedStock(to, summary?)`** — Returns `true` if moving to `shipped`/`delivered` would ship units whose stock hasn't arrived. Serves as the single consistency guard the override service consults.
- **`SettlementMove`** (type) — Union: `'ship' | 'deliver' | 'complete' | 'undeliverable'`.
- **`settlementFor(status, summary)`** — Given the order's current status and the summary, returns the forward status move the summary makes due, or `undefined`.
- **`fulfillmentStatusOf(status, summary?)`** — Derives the `OrderFulfillmentStatus` value (`partially_fulfilled`, `on_hold`, etc.) from status + summary. Consults `ORDER_STATUS_TRAITS` first; only refines when the trait says `followsSummary`.
- **`FulfillmentFilter`** (type) — `Readonly<Record<string, unknown>>`, keeping the domain free of any Mongo driver import.
- **`fulfillmentStatusFilter(wanted)`** — Builds the Mongo filter behind `GET /orders?fulfillmentStatus=`. Derived from the same `ORDER_STATUS_TRAITS` table that `fulfillmentStatusOf` reads, so the filter and the serialized value on a row cannot disagree.
- **`everyRemainingUnitHeld(summary)`** (private) — True when nothing shipped, units remain, and every remaining unit is on hold.

## Relationships

- **`src/modules/orders/domain/lifecycle.ts`** — Imports `isAwaitingGoods` to expand the `awaiting_shipment` aggregate filter.
- **`src/modules/orders/domain/status-traits.ts`** — Imports `ORDER_STATUS_TRAITS` and `statusesWhere` as the single source of truth for per-status fulfillment values and which statuses follow the summary.
- **`src/modules/orders/domain/index.ts`** — Barrel file; re-exports the symbols from this module to the rest of the `orders` package.
- **`src/modules/orders/domain/withdrawal.ts`** — Sibling domain file in the same barrel; reads the same summary for withdrawal-related logic.
- **`src/modules/orders/services/fulfillment.ts`** — The service that writes the summary (via `orderService.recordFulfillmentProgress`); this file is the read-side interpretation of whatever that write produces.
- **`src/modules/orders/services/override.ts`** — Calls `shipsAwaitedStock` to gate the override door; the override menu uses the same answer to hide the move.
- **`src/modules/orders/services/status.ts`** — Calls `fulfillmentStatusOf` to expose the derived fulfillment status on the order.
- **`src/modules/orders/services/read.ts`** — Consumes `fulfillmentStatusFilter` to build the `?fulfillmentStatus=` listing query.
- **`src/modules/orders/model.ts`** / **`src/modules/orders/repository.ts`** — The `Order` model carries the `FulfillmentSummary` field; the repository persists and retrieves it.
- **`src/modules/orders/tests/integration/fulfillment-filter.test.ts`** — Integration tests for `fulfillmentStatusFilter`.
- **`src/modules/orders/tests/integration/service-status.test.ts`** — Integration tests exercising the status service (which depends on `fulfillmentStatusOf`).

## Notes

- **No driver import in the domain.** `FulfillmentFilter` is deliberately typed as a plain record so the domain layer never references Mongoose/Mongo types; the repository or service layer is responsible for handing the object to the driver.
- **`awaiting_shipment` is an aggregate.** No single row stores that value; it is computed at query time by listing every status that `isAwaitingGoods` names.
- **Digital fulfillment** is modeled as a shipment born delivered, so `lastDeliveredAt` is set and `undelivered` is `0`—`settlementFor` returns `'complete'` for it.
- **`NO_FULFILLMENT` is frozen** (`Object.freeze`); treat it as immutable and safe to share.
- **Recomputation invariant.** The summary is recomputed inside the same transaction as the write that changed fulfillment orders, so a stale read can never overwrite a newer one (per the module doc-comment).
