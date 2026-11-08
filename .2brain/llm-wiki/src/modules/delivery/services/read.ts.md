---
source: src/modules/delivery/services/read.ts
sha256: afbdbe3b0d0af6e86d6cd5b01a9da0edce9b5483d23ff28f6410d230b07b5ea9
generated_at: 2026-11-08T05:38:32.099832+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/read.ts

## Purpose

Read-only service layer for fulfillment orders and shipments. Serves the order-page `GET` endpoints (`/orders/:id/fulfillment-orders`, `/shipments`), the narrow reads the `returns` module needs (shipped quantities, remainder options), and the two bulk sections of the account data export. Fulfillment orders and shipments carry no ownership of their own; access is always scoped through the parent order.

## Key elements

- **`listFulfillmentOrdersForOrder(orderId, authContext?)`** — Lists fulfillment orders for an order. Calls `ensureFulfillmentOrders` first (safety net for paid orders missing fulfillment orders). Returns `[]` for unpaid orders; never a 404 for absence.
- **`listShipmentsForOrder(orderId, authContext?)`** — Lists shipments for an order. Reads `restorableIds` once to flag which shipments can restore a lost parcel.
- **`getShipment(shipmentId, authContext?)`** — Single shipment by id. Scopes via the parent order; a missing or unseen shipment returns the same 404.
- **`getFulfillmentOrder(fulfillmentOrderId, authContext?)`** — Single fulfillment order by id. Same scope-through-order pattern.
- **`shippedQuantities(orderId)`** — Sums `shippedQuantity` per product across all fulfillment orders. Used by `returns` to gate what can be returned.
- **`RemainderOption`** — Interface: `{ fulfillmentOrderId, number, lines[] }` describing what a remainder cancel would take.
- **`remainderOptions(orderId, shipped)`** — Returns fulfillment orders still having unshipped units. Returns `[]` if nothing has shipped and fewer than two live groups remain (last group is canceled as the whole order instead).
- **`findShipmentsForOrders(orderIds)`** — Bulk shipment read for the account export. Short-circuits on empty array.
- **`findFulfillmentOrdersForOrders(orderIds)`** — Bulk fulfillment-order read for the account export. Same short-circuit.

## Relationships

- **`../repository`** — Reads from `fulfillmentOrderRepository` and `shipmentRepository` for all list/get/bulk operations.
- **`../domain` (fulfillment)** — Uses `remainderLines`, `remainingOfLine`, and the `ProductQuantity` type for remainder/shipped-quantity math.
- **`../model`** — Types `FulfillmentOrderDocument` / `ShipmentDocument` for the export reads.
- **`../presenter`** — Calls `presentFulfillmentOrder` to shape list output.
- **`./actions`** — Pulls `standingOn`, `fulfillmentOrderActions`, `presentShipmentFor`, `viewFulfillmentOrder` to attach per-record action menus and scope-aware views.
- **`./ensure`** — `ensureFulfillmentOrders` is invoked before listing to guarantee a paid order has fulfillment orders (safety net behind the `paid` event listener).
- **`./found`** — `restorableIds` and `viewShipmentOf` supply the lost-parcel flag and the single-shipment view.
- **`@infrastructure/http/response`** — Wraps all returns in `generateSuccess` / `generateReject`.
- **`@infrastructure/i18n`** — Localises 404 messages via `t(...)`.
- **`@modules/orders`** — Uses `orderService.getById` + `callerScope` for ownership checks and to re-fetch the order after `ensure` may have mutated its status.
- **`services/index.ts`** — Re-exports this module's public API to consumers.

## Notes

- **Ownership is always the order's.** Fulfillment orders and shipments have no independent owner; every read funnels through `orderService.callerScope(authContext)`. A missing or out-of-scope parent order yields the same 404 as a missing child.
- **`ensureFulfillmentOrders` can change order status.** The list handler re-fetches the order after `ensure` completes (`fresh ?? order`) because the ensure step may transition the order (e.g. mark it fulfilled). The stale `order` captured before the call is only the fallback.
- **`remainderOptions` semantics:** before anything ships, a group is cancelable alone only if *another* group stays live. Once any shipment exists, every group with remaining lines is a valid remainder target.
- **Export reads live here, not on `deliveryService`.** `deliveryService` is reserved for this module's own subscription/admin surface; the export calls these two bulk functions directly.
- **Absent ≠ 404 for lists.** A paid order with zero fulfillment orders returns `[]` (or triggers `ensure`), not an error. The 404 is reserved for "the order itself is missing or not yours."
