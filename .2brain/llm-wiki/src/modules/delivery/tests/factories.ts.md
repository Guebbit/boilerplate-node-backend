---
source: src/modules/delivery/tests/factories.ts
source_sha256: b1b9b4c5955b4c377c452e63271d72d11ba6fdc60dde5f8f7f687a1c4e52c0fe
context_sha256: 7e78ff7c814b27ed415e8c7b882ca756312ace4b11011e01fca7cab6bdf82c8e
generated_at: 2026-11-22T05:00:15.652269+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/tests/factories.ts

## Purpose
Test factories for the delivery module. They take an order to "shipped" or "delivered", or build paid preorder and backorder orders, by calling the module's own services (`deliveryService`, `inventoryService`) as an admin. The resulting fulfillment orders, shipments, summary, status and inventory ledger all match what a real order would have. The only direct DB writes are a few helpers that set states no service call can reach, such as past dates.

## Key elements
- `ShipEverythingOptions` – options for `shipEverything`: `trackingCode`, `forced` (ship from `paid` as an override holder) and `reason` (required when forced).
- `fulfillmentOrdersOf(orderId)` – calls `deliveryService.ensureFulfillmentOrders`, then reads the order's fulfillment orders from the repository.
- `shipmentsOf(orderId)` – reads the order's shipments from the repository.
- `setFulfillmentOrderState(id, fields)` – writes `agreedAt`, `expectedAt`, `lastNoticeAt` or `dueNoticeFor` straight to `fulfillmentOrderModel`.
- `setFirstLineShipped(id, qty)` – writes `lines.0.shippedQuantity` straight to the model.
- `shipEverything(orderId, options)` – ships every `physical`, `open` fulfillment order via `deliveryService.shipFulfillmentOrder`, one shipment each, and returns the shipments. It throws if any call fails.
- `deliverEverything(orderId)` – delivers every shipment with status `shipped` via `deliveryService.deliverShipment`. It throws if any call fails.
- `carryOrderTo(orderId, 'shipped' | 'delivered')` – forces the order to `processing`, ships everything with tracking code `TRK-CARRIED01`, and delivers everything when the target is `delivered`.
- `WantedPreorder` and `paidPreorderOrder(wanted, buyer?, shippingAddress?)` – build a `paid` order with one product per wanted line, each with `onHand: 0`. They set the backorder limit to the quantity, then reserve and commit in the ledger. They return `{ user, orderId, productIds }`.
- `WantedBackorder` and `paidBackorderOrder(wanted, buyer?)` – build a `paid` order for one product that allows backorder. The shelf units are taken and the rest are claimed against an uncapped limit (`setBackorderLimit(productId, null)`). The owed part is frozen on the line with a promise computed by `owedLineOf` and `BACKORDER_PROMISE_DAYS`. They return `{ user, orderId, productId }`.
- `backdateShipments(daysAgo)` – sets `shippedAt` on every shipment, with no filter, to `daysAgo` days in the past, using `DAY_MS`.

## Relationships
- Calls `deliveryService` (`../services`) for all ship and deliver actions.
- Uses `fulfillmentOrderRepository` and `shipmentRepository` (`../repository`) for reads, and `fulfillmentOrderModel` and `shipmentModel` (`../model`) for the direct writes.
- Uses `DAY_MS` from `src/domain-primitives/time.ts`.
- Builds on other modules' test factories and services: `createUser`, `createProduct`, `createOrder`, `forceOrderStatus` and `toOrderItem`, plus `inventoryService`, `owedLineOf`, `BACKORDER_PROMISE_DAYS`, and `asAdmin`/`callerContextAs` from `@tests/callers`.
- Used by the delivery integration tests (backorder, destination, lost-parcel, order-status-races, override-sync, preorder-board, preorder-late, preorder, release-date-impact), by `api.contract.test.ts`, and by the account `shop.contract.test.ts`.

## Notes
- `backdateShipments` updates all shipments, not only one order's, so it is only safe where one order's shipments exist, or where affecting all of them is acceptable.
- Neither order builder creates fulfillment orders. They appear only once something calls `fulfillmentOrdersOf` or `ensureFulfillmentOrders`.
- `paidPreorderOrder` defaults the buyer to `buyer@example.com`. A test that builds two orders must pass distinct addresses, because a string buyer creates a new account each time.
- `shipEverything` skips non-physical and non-`open` fulfillment orders. `deliverEverything` skips shipments that are not `shipped`.
