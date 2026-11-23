---
source: src/modules/returns/tests/integration/lost-parcel.test.ts
source_sha256: 12f655fea7864018f5540d468b53d9bdffe9c91bf47b3851fe48ae4daf6315e9
context_sha256: 90d3e7f9cba00a2f8df79988d1fac5d0d48dce7a5e0eff7686c5707894f2fe82
generated_at: 2026-11-22T07:34:34.514349+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/tests/integration/lost-parcel.test.ts

## Purpose
Integration test, run against a real database and the real `fake` payment provider. It checks what a lost parcel does to the buyer's remedies. The units it carried become open again on the same fulfillment order, so the buyer can cancel them (refund plus stock released). Goods that never arrived cannot be returned, and a replacement can be returned once, never beyond the quantity bought. The file's header points to the "lost-in-transit" section of the delivery module docs.

## Key elements
- `shippedParcel()`: arranges a 75.00 card-paid order (2 shirts at 30.00, 1 mug at 10.00, 5.00 delivery). It reserves stock, creates and confirms the payment, forces the order to `processing`, and ships the whole fulfillment order as ONE parcel. It returns the user, products, `orderId`, `fulfillmentOrderId` and `shipmentId`. Each call uses a new `lost-N@example.com` customer.
- `Parcel`: type alias for the helper's return value.
- `lose(parcel)`: staff mark the shipment lost via `deliveryService.markShipmentLost`.
- `refundsOf(orderId)`: reads the payment through `paymentService.getForOrder` and returns `{reason, amount}` for each refund.
- `cancelRemainder(parcel)`: the buyer files a `cancellation` return for the fulfillment order.
- Test groups visible in the file:
  - `cancelling what a lost parcel carried`: the refund is 75.00 including delivery, stock comes back, and no second refund is recorded.
  - `settling an order whose every parcel was lost and refunded`:
    - The order ends `canceled` with cause `lost`, `paymentStatus` `refunded`, no `withdrawUntil`/`conformityUntil`, no `delivered` timeline row, one refund, and the reservation `released`.
    - The cancel is reported once, as the system, to analytics and audit, even when the outbox re-relays it.
    - A parcel found later gets `DELIVERY_NOT_DELIVERABLE` and no deliver action.
    - The order stays `delivered` if another parcel did arrive.
  - `returning goods after a loss`:
    - Goods that never arrived cannot be returned, and `shippedQuantities` is `[]` while the parcel is lost.
    - A replacement is counted once, not twice the quantity bought. The rest of this group is not shown here.

## Relationships
- `src/modules/delivery/index.ts` (`deliveryService`: `shipFulfillmentOrder`, `markShipmentLost`, `deliverShipment`, `getShipment`, `shippedQuantities`) and `src/modules/delivery/tests/factories.ts` (`fulfillmentOrdersOf`, `shipmentsOf`) drive and inspect the shipments.
- `src/modules/inventory/index.ts` (`inventoryService`) sets up reservations, and `src/modules/inventory/tests/factories.ts` (`reservationRepository`) checks them. Stock counters come from `countersOf` in the products test factories.
- `src/modules/payments/index.ts` (`paymentService`) and `src/modules/payments/module.ts` (`paymentsModule`, registered in `beforeEach`) handle intent, confirmation and refund inspection.
- `src/modules/orders/tests/factories.ts` provides `createOrder`, `forceOrderStatus`, `readOrder`, `timelineOf` and `toOrderItem`.
- The returns module (`../../module`, `../../services`, `../../events`) is the code under test. `returnsModule` is registered, and `returnService` is called. `RETURN_CLOSED` and `RETURN_REQUESTED` are imported.
- `src/kernel/events.ts` supplies `resetDomainEvents`, called after each test.
- `src/kernel/outbox.ts` supplies `nudgeOutbox`, `settleOutboxNudges` and `outboxEventModel`. They are used to flush the outbox, and to reset the canceled-order events to `pending` so the relay re-runs them.
- `src/infrastructure/observability/audit.ts` and `src/infrastructure/observability/analytics/index.ts` are mocked out. The audit port uses `auditPortMock()` from `@tests/ports`. Analytics keeps the real exports but replaces `emitAnalyticsEvent` with a mock function. `observePort` then reads their calls.

## Notes
- The ports are replaced, not spied on, as the file's comment says (see `tests/support/ports.ts`).
- `registerCheckoutModules([paymentsModule, returnsModule])` runs in `beforeEach`, and `setupTestDb()` provides the database.
- The idempotence test checks that a relay retry does not raise the analytics or audit count above one. The audit entry carries `actorRole: 'system'`, `actorUserId: 'system'` and metadata `{ cause: 'lost', refund: false }`.
- `cancelRemainder` repeats the `createReturn` call written inline in the first test.
