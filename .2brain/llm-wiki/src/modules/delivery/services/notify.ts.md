---
source: src/modules/delivery/services/notify.ts
generated_at: 2026-11-22T04:56:22.074445+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/services/notify.ts

## Purpose
Holds the buyer-facing emails that the delivery module sends. Each email is sent by a listener on its own domain event (`shipment.shipped`, `shipment.delivered`, `shipment.lost`, `fulfillment_order.delayed`, `fulfillment_order.hold_noticed`). A listener covers every path that announces the event, whether staff, the status override's follow-up or the daily sweep, and a crash after the commit still sends. A failed mail never undoes the act that triggered it.

## Key elements
- `mailShipped(payload)` – Handles `shipment.shipped`. It skips shipments with no `remainingUnits` (digital fulfillments, which are born delivered). Otherwise it loads the shipment, builds `shipmentShippedEmail` and logs an operator info line. Errors are logged and swallowed.
- `mailTrackingChanged(shipment, variant)` – Sends the "shipped" mail again with its own subject when a tracking code is `added` or `corrected`. It uses `remainingUnits: 0`. It is best effort, and failures are logged at `warn`.
- `mailDelivered(payload)` – Handles `shipment.delivered`. It includes `withdrawUntil` only when the order status is `OrderStatus.delivered`. The deadline is read fresh from the order because the listener runs after the transaction wrote it.
- `mailLost(lost)` – Handles `shipment.lost`. It reports the reason, the lines, the units owed, an optional `expectedAt`, staff's message and an order link. It is always sent, with no switch.
- `mailDelayed(delayed)` – Handles `fulfillment_order.delayed`. It reports the late preorder titles, `agreedAt`, an optional `expectedAt`, the reason and an order link.
- `mailHoldNoticed(held)` – Handles `fulfillment_order.hold_noticed`. It sends the hold notice (an address to check, or a staff message) with an order link.
- `emailLines` (private) – Maps a shipment's lines to `{ title, quantity }`.

## Relationships
- **`src/modules/orders/index.ts`** – Every mail goes through `orderService.mailBuyerOfOrder(orderId, cb)`, which supplies the order, locale and name. `orderFrontendLink` builds the order-page URLs.
- **`src/modules/delivery/emails.ts`** – Provides the email builders (`shipmentShippedEmail`, `shipmentDeliveredEmail`, `shipmentLostEmail`, `fulfillmentDelayedEmail`, `holdNoticeEmail`) and the `TrackingVariant` type.
- **`src/infrastructure/adapters/mailer.ts`** – `enqueueEmail` queues each built mail.
- **`src/infrastructure/adapters/logger.ts`** – Logs the shipped line and the failures.
- **`src/modules/delivery/repository.ts`** – Its `shipmentRepository.findById` loads the shipment in `mailShipped`, `mailDelivered` and `mailLost`.
- **`src/kernel/events.ts`, `src/modules/delivery/events.ts`, `src/modules/delivery/model.ts`** – Supply the event payload types (`DomainEventMap`, `FulfillmentOrderDelayed`, `FulfillmentOrderHoldNoticed`) and `ShipmentDocument`.
- **Other neighbors** – `src/modules/delivery/services/index.ts`, `src/modules/delivery/services/tracking.ts` and the unit tests are not imported here. The file exports the handlers, so those neighbors presumably wire or call them.

## Notes
- `enqueueEmail` is called with `void` (eslint floating-promise disabled) because it never rejects and logs its own failure.
- Error handling differs by function. `mailShipped`, `mailDelivered` and `mailLost` catch and log at `error`. `mailTrackingChanged` catches and logs at `warn`. `mailDelayed` and `mailHoldNoticed` have no local `.catch`, and the file says `mailBuyerOfOrder` itself logs and swallows.
- If a shipment is not found by id, `mailShipped`, `mailDelivered` and `mailLost` send nothing and do not error.
- Some log blocks are wrapped in `Stryker disable` comments for mutation testing.
