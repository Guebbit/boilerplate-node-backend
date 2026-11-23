---
source: src/modules/delivery/services/ship.ts
source_sha256: 628ae3bf4414de43c6425f072b0bb377529b53b9f81e0cab91298c54d1bbad66
context_sha256: b0b2673461512890d48cac21c171f058047164f4dae085e29a9b2ae0cc2e4eb5
generated_at: 2026-11-22T04:59:05.655607+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/services/ship.ts

## Purpose
Implements the staff "ship" act: cutting a shipment from a fulfillment order. All state changes (fulfillment order lines, shipment, stock leaving the shelf, order summary and, when nothing remains, order status, plus the shipped event) commit in one transaction. The audit row and shelf refresh happen after commit. A `paid` order can ship, because the act performs the `paid → processing` move itself; nothing ships from `on_hold`.

## Key elements
- `ShipInput` — staff input: optional `lines` (`ProductQuantity[]`; absent means everything remaining) and optional `trackingCode`.
- `shipFulfillmentOrder(fulfillmentOrderId, input, authContext, context)` — the exported entry point. It computes `mayStart` before the transaction opens, runs `shipAct` via `runAct`, and returns either the refusal or a 201 `ResponseSuccess<Shipment>` built with `viewShipment`.
- `shipAct` (internal) — the transactional body:
  1. Reads the fulfillment order and its order.
  2. Applies the order and fulfillment-order gates.
  3. Cuts the shipment.
  4. Starts fulfillment.
  5. Reports progress.
  6. Settles the order.
  7. Announces the shipment.
- `gateOrder` (internal) — refuses with 409 `DELIVERY_NOT_SHIPPABLE` for `canceled` or `pending` orders. It then applies `refuseUnearnedStart` (403 for a `paid` order when the caller lacks start permission) and refuses with 409 `ORDER_NOT_PROCESSING` if the order is not open for shipment.
- `gateFulfillmentOrder` (internal) — refuses with 409 if the kind is not `physical` or the order is not shippable. It refuses with 422 `DELIVERY_LINES_INVALID` if `checkShipLines` fails; otherwise it returns the validated lines.
- `afterShipped` (internal) — refreshes the shelf's availability entry for the shipped product ids, then writes the `ADMIN_ORDER_SHIPPED` audit row.

## Relationships
- `./act` — supplies `runAct` (transaction and refusal wrapper), `readWithOrder` and `refuse`.
- `./cut` — `cutShipment` creates the shipment, called with `takeStock: true`, `forced: false`, `delivered: false`.
- `./progress` — `startFulfillment`, `reportProgress` and `settleOrder` handle the order-side moves.
- `./announce` — `announceShipped` announces the shipment, passing the remaining units.
- `./ship-gate` — the permission and state helpers `mayStartFulfillment`, `refuseUnearnedStart`, `isOpenForShipment` and `auditUnearnedStart`.
- `./actions` — `viewShipment` shapes the response.
- `../domain` — `isShippable`, `checkShipLines` and the `ProductQuantity` type.
- `../model` — `FulfillmentOrderDocument` and `ShipmentDocument` types.
- `../audit` — `deliveryAuditActions`.
- `@modules/orders` (`src/modules/orders/index.ts`) — the `orderService` used for the shelf refresh, and the `OrderDocument` type.
- `@infrastructure/http/response` — `generateSuccess` and the `ResponseSuccess`/`ResponseReject` types.
- `@infrastructure/observability/audit` — `recordAudit`.

## Notes
- The caller needs both `update:Shipment` and `start:Shipment` to ship from a `paid` order.
- `mayStart` is computed once, outside the transaction, so a retried transaction cannot change the verdict.
- Refusals are decided before any write, using the same snapshot the writes land in.
- When a refusal is returned, `auditUnearnedStart` is called with the reject and the fulfillment order id.
- The buyer's mail rides the shipped event, not this file directly.
