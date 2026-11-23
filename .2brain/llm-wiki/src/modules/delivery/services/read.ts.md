---
source: src/modules/delivery/services/read.ts
source_sha256: 267fc59cc2b0798b7dddafbc7cea72ebc6250e100b9eca303686d303e0f67f04
context_sha256: b98847374f9d8e9a93e93bb9b580b27ab0a413cf4b9f34aa9c6524beb2a5fc04
generated_at: 2026-11-22T04:57:38.722712+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/services/read.ts

## Purpose
The read side of the delivery module's services. It serves the order page's fulfillment-order and shipment queries, item reads by id, a few narrow reads that `returns` makes (what has shipped, what a remainder cancel would take), and the two account-export sections. Fulfillment orders and shipments have no owner of their own. Ownership comes from the parent order, read through `orderService`'s caller scope.

## Key elements
- `listFulfillmentOrdersForOrder(orderId, authContext?)` — loads the order under the caller's scope (404 `delivery.order-not-found` if missing or unseen). It then returns the order's fulfillment orders, each presented with its own `actions`. An order with none returns `[]`, not a 404.
- `listShipmentsForOrder(orderId, authContext?)` — same scoping. It computes `restorableIds` once per order (for a lost parcel's `deliver` flag) and presents each shipment via `presentShipmentFor`.
- `getShipment(shipmentId, authContext?)` — item read. A missing shipment, or one whose order the caller can't see, gives the same 404 (`delivery.shipment-not-found`).
- `getFulfillmentOrder(fulfillmentOrderId, authContext?)` — item read with the same 404 behavior (`delivery.fulfillment-order-not-found`).
- `orderIdOfFulfillmentOrder(id)` — returns the owning order id with no caller scope, or `undefined`. It exists so notices can name the order whatever the reader may see.
- `shippedQuantities(orderId)` — per-product sum of `shippedQuantity` across the order's fulfillment orders, with zero entries dropped. `returns` uses it to gate returns.
- `RemainderOption` / `remainderOptions(orderId, shipped)` — fulfillment orders that still have units to cancel, with remaining quantity per product and the frozen title. If nothing has shipped and fewer than two groups are live, it returns `[]`, because the last live group is the whole order and is canceled as an order.
- `findShipmentsForOrders(orderIds)` / `findFulfillmentOrdersForOrders(orderIds)` — raw document reads for the account export. Both short-circuit to `[]` on empty input.

## Relationships
- **`@modules/orders` (`orderService`)**: supplies `getById` and `callerScope`, which apply the order-ownership scope to every scoped read.
- **`../repository`**: `fulfillmentOrderRepository` and `shipmentRepository` supply `findByOrderId`, `findByOrderIds` and `findById`.
- **`./actions`**: supplies `standingOn`, `fulfillmentOrderActions`, `presentShipmentFor` and `viewFulfillmentOrder`, which compute the caller's standing and each record's `actions`.
- **`./found`**: supplies `restorableIds` and `viewShipmentOf`.
- **`../presenter`**: `presentFulfillmentOrder` shapes the API view.
- **`../domain`**: `remainderLines` and `remainingOfLine` give the remainder arithmetic. `ProductQuantity` is the return type of `shippedQuantities`.
- **`../model`**: provides the `ShipmentDocument` and `FulfillmentOrderDocument` types for the export reads.
- **`@infrastructure/http/response` and `@infrastructure/i18n`**: provide `generateSuccess`, `generateReject` and `t` for the 404 messages.
- **Consumers**: `returns` uses `shippedQuantities` and `remainderOptions`, and the account export uses the two `find…ForOrders` reads. Both are described in the file's comments, not visible in its imports.

## Notes
- The file is read-only. Fulfillment orders are created elsewhere (the `paid` listener, `start`, a preorder allocation, or an operator reviving a dead `paid` event).
- The `find…ForOrders` reads are deliberately exported separately from `deliveryService`, which is reserved for the module's own subscription and admin surface. They are the one narrow read a sibling module may make.
- `orderIdOfFulfillmentOrder`, `shippedQuantities`, `remainderOptions` and the export reads apply no caller scope. Callers must pass already-authorized ids.
