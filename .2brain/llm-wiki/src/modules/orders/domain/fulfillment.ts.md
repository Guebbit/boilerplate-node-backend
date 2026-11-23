---
source: src/modules/orders/domain/fulfillment.ts
source_sha256: 7828b1a313bc6383f313ef997c2e601701f28baa549ff0f1aa76e1b2bd72b49b
context_sha256: 99d7fdfd8726154d989d9093f05ab208f9f24ad088cd623c11c0bb644c1ee092
generated_at: 2026-11-22T06:11:31.740197+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/domain/fulfillment.ts

## Purpose
Defines the fulfillment summary an order carries and the pure (no I/O) logic that reads it. Because `orders` cannot import `delivery`, `delivery` reports goods status as one small record, written only through `orderService.recordFulfillmentProgress`. Everything in `orders` that asks about the goods reads that record via this file.

## Key elements
- **`FulfillmentSummary`**: interface with `shipped`, `remaining`, `onHold`, `awaitingStock`, `undelivered`, and optional `lastDeliveredAt`.
- **`NO_FULFILLMENT`**: frozen default summary (all zeros, not shipped) for orders with no fulfillment orders yet.
- **`shipsAwaitedStock(to, summary)`**: true when moving to `shipped` or `delivered` while `awaitingStock > 0`. A consistency guard used by both the override door (refuses) and the override menu (omits).
- **`SettlementMove`**: `'ship' | 'deliver' | 'complete' | 'undeliverable'`.
- **`settlementFor(status, summary)`**: returns the status move the summary makes due, or `undefined`.
  - Nothing is due while units remain or nothing has shipped.
  - A shipment still out gives `processing -> shipped`.
  - All delivered gives `shipped -> delivered`, or `complete` (both moves at once) from `processing`.
  - Nothing out and nothing ever delivered from `processing` gives `undeliverable` (cancel, cause `lost`).
- **`fulfillmentStatusOf(status, summary)`**: derives the `OrderFulfillmentStatus`. First match wins: the status trait's value if it ignores the summary; `partially_fulfilled` if shipped with units remaining; `on_hold` if nothing shipped and every remaining unit is held; otherwise the trait's value.
- **`FulfillmentFilter`**: plain-data Mongo filter type (`Readonly<Record<string, unknown>>`), so the domain imports no driver.
- **`fulfillmentStatusFilter(wanted)`**: builds the query for `GET /orders?fulfillmentStatus=`. It mirrors `fulfillmentStatusOf` using `ORDER_STATUS_TRAITS` rather than a stored copy.

## Relationships
- **`./lifecycle`**: `isAwaitingGoods` defines the statuses grouped under the `awaiting_shipment` filter.
- **`./status-traits`**: `ORDER_STATUS_TRAITS` (the per-status `fulfillment` trait, with its `value` and `followsSummary`) and `statusesWhere` drive both `fulfillmentStatusOf` and the filter.
- **`@types`**: supplies `OrderStatus`, `OrderFulfillmentStatus`, and `OrderFulfillmentFilter`.
- The other neighbors are the domain barrel (`index.ts`), `withdrawal.ts`, `model.ts`, `repository.ts`, `services/*` (including `src/modules/orders/services/fulfillment.ts`, `override.ts`, `status.ts`, `read.ts`), and the integration tests (`fulfillment-filter.test.ts`, `service-status.test.ts`). They sit around this file in the dependency graph. The file's own comments describe `recordFulfillmentProgress` as the only writer and the override door and menu as consumers of `shipsAwaitedStock`.

## Notes
- `fulfillmentStatusFilter` must stay consistent with `fulfillmentStatusOf` (`PARTIALLY_SHIPPED` is row 2, `EVERY_UNIT_HELD` is row 3). Change one and the other has to follow.
- `awaiting_shipment` is an aggregate: no row carries it as a value, and it is computed from `isAwaitingGoods`.
- `EVERY_UNIT_HELD` uses `$expr` to compare `fulfillment.remaining` with `fulfillment.onHold`.
- `shipped: { $ne: true }` in the filter also matches documents with no summary.
- A digital fulfillment counts as a shipment born delivered, so it sets `lastDeliveredAt`.
- Summaries are recomputed in the same transaction as the write that changed them, so a stale read cannot overwrite a newer one.
- The module doc points to the "the fulfilment summary" section of the orders docs; see `src/modules/orders/model.ts` for the order model.
