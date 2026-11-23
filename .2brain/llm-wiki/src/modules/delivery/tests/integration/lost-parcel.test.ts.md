---
source: src/modules/delivery/tests/integration/lost-parcel.test.ts
source_sha256: 919922839b3becb8db9d741bd51c9cb1010bb992a428e312d05ffb05bcfdad87
context_sha256: 317650ec81d8f61a6a9345c8022cff4a5d41dc2bdf878664b686e42adb4c48f6
generated_at: 2026-11-22T05:01:03.463562+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/tests/integration/lost-parcel.test.ts

## Purpose
Integration test suite for the "lost in transit" flow of the delivery module. It pins that a lost shipment's units reopen on the same fulfillment order and can be reshipped, the stock hold is topped up from free shelf stock (any remainder owed outside the backorder cap), the order steps `shipped → processing` and forward again with the replacement, the buyer is mailed once using the staff-written message (never the internal note), and `deliver` takes a lost parcel back only when every unit on it is still open. It runs against real Mongo and a real outbox, with only the mailer queue mocked.

## Key elements
- **Mocked mailer**: `jest.mock` of `@infrastructure/adapters/mailer` replaces `enqueueEmail` (`mockEnqueueEmail`); `lostMails()` filters calls with template `delivery.shipment-lost`.
- **Setup**: `setupTestDb()`. `beforeEach` resets domain events, subscribes `deliveryModule` and `ordersModule`, then calls `markDomainEventsWired()`. `afterEach` resets events and clears mocks.
- **`shippedOrder(quantity, onHand, email)`**: builds a user, product, `processing` order, reserves and commits stock, ships the fulfillment order (tracking `TRK-LOST0001`) and returns `{ user, orderId, productId, shipmentId }`.
- **`reportLost(shipmentId, input?)`**: calls `deliveryService.markShipmentLost` as admin (default reason `'lost'`), then `settleOutboxNudges()`.
- **`reship(orderId)`**: ships the first fulfillment order again (tracking `TRK-AGAIN0002`).
- **Read helpers**: `statusOf`, `timelineTypes`, `reservedOf`, `holdStatusOf`, `firstShipmentStatus`, `shipmentWith`, `levelOf` (onHand/reserved/available/backordered).
- **Test groups** (visible portion):
  - `reporting a parcel lost`: reopens units on the same fulfillment order and moves the order to `processing` (fulfillment still `shipped: true`, so whole-order cancel stays closed); hold top-up from free shelf with no owed claim; loss recorded once across timeline, audit (`admin.shipment.lost`, metadata only `shipmentId` and `reason`, no note/message text), outbox events, and one mail; no invoice, new order or extra shipping charge; reship then deliver ends `delivered` with `withdrawUntil` from the replacement; partial-ship case leaves a `processing` order unchanged.
  - `the admin override after a loss`: `orderService.overrideStatus` to `shipped` after a loss moves the reopened order forward as one forced shipment.

## Relationships
- `@infrastructure/adapters/mailer`: mocked so mail assertions inspect enqueued templates.
- `@infrastructure/observability/audit`: `registerAuditSink` captures `AuditEntry` objects to assert the audit trail.
- `@kernel/events` and `@kernel/outbox`: events are reset and wired per test; `outboxEventModel` is counted to assert which events were emitted; `settleOutboxNudges` flushes delivery (`nudgeOutbox` is also imported).
- `@modules/delivery/services` (`deliveryService`), `model` (`shipmentModel`), `module` (`deliveryModule`), and `tests/factories` (`fulfillmentOrdersOf`, `shipmentsOf`): the unit under test and its read helpers.
- `@modules/orders` (`orderService`), `module` (`ordersModule`), and orders test factories: order creation and reads, status override.
- `@modules/inventory` (`inventoryService`) and inventory test factories (`stockLevelRepository`, `reservationRepository`): reserve/commit stock and inspect levels and holds.
- `@infrastructure/runtime/database`: `withTransaction` is imported.

## Notes
- Several imports (`nudgeOutbox`, `shipmentModel`, `withTransaction`, `setEnvironment`, `detachOrderUserId`, `forceOrderStatus`, `markOrderPaidAt`, `asCustomer`, `testCallerContext`, `asReject`) are likely used in parts of the suite beyond the visible portion.
- A lost shipment still counts as shipped for fulfillment purposes (`shipped: true`, `remaining` reflects reopened units, `undelivered: 0`).
