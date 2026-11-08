---
source: src/modules/delivery/services/notify.ts
sha256: 275b86155f6b603075cdd06cce781f5ca0dafa6bfc0d0ba1691324b1ef7fb905
generated_at: 2026-11-08T05:37:08.349125+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/notify.ts

## Purpose

Buyer-facing email notifications for delivery events. Each exported function is a fire-and-forget listener that reacts to one domain event (`shipment.shipped`, `shipment.delivered`, `shipment.lost`, `fulfillment_order.delayed`, `fulfillment_order.hold_noticed`), loads the needed context, and enqueues an email. A failure to send never propagates or undoes the underlying business act.

## Key elements

- **`emailLines(shipment)`** – internal helper; maps `ShipmentDocument.lines` to `{ title, quantity }[]` for email templates.
- **`mailShipped(payload)`** – listener for `shipment.shipped`. Loads the shipment, composes the "on its way" email with tracking code and remaining units. Short-circuits (no mail) when `remainingUnits` is `undefined` (digital fulfillment).
- **`mailTrackingChanged(shipment, variant)`** – re-sends the shipped email with a new or corrected tracking code. `variant` is `TrackingVariant` (`added` | `corrected`). Uses `remainingUnits: 0` as a placeholder.
- **`mailDelivered(payload)`** – listener for `shipment.delivered`. Includes the order's `withdrawUntil` deadline only when the order status is `OrderStatus.delivered`.
- **`mailLost(payload)`** – listener for `shipment.lost`. Always sends (no feature toggle). Carries reason, owed units, optional `expectedAt`, optional staff `message`, and the order frontend link.
- **`mailDelayed(delayed)`** – listener for `fulfillment_order.delayed`. Informs the buyer their preorder is late or the date passed with no stock.
- **`mailHoldNoticed(held)`** – listener for `fulfillment_order.hold_noticed`. Notifies the buyer that a hold needs their attention (address check or staff message).

## Relationships

- **`@infrastructure/adapters/mailer`** – every mail function calls `enqueueEmail` to actually dispatch; this is the only outbound side-effect.
- **`@infrastructure/adapters/logger`** – each function logs an `error`/`warn` line in its `.catch` path and an `info` line on success (shipped).
- **`@modules/orders`** – `orderService.mailBuyerOfOrder` resolves the order, buyer name, and locale before the template is built; `orderFrontendLink` constructs the order-page URL embedded in the lost/delayed/hold emails.
- **`../emails`** – provides the template builders (`shipmentShippedEmail`, `shipmentDeliveredEmail`, `shipmentLostEmail`, `fulfillmentDelayedEmail`, `holdNoticeEmail`) and the `TrackingVariant` type.
- **`../repository`** – `shipmentRepository.findById` loads the `ShipmentDocument` needed for shipped, delivered, and lost emails.
- **`../events`** – imports the `FulfillmentOrderDelayed` and `FulfillmentOrderHoldNoticed` payload types.
- **`../model`** – imports `ShipmentDocument` for typing.
- **`@kernel/events`** – `DomainEventMap` supplies the payload types for shipment events.
- **`../services/tracking.ts`** – sibling service that calls `mailTrackingChanged` after persisting a new/corrected tracking code.
- **`../services/index.ts`** – barrel that re-exports these notification functions for registration as event listeners.

## Notes

- All exported functions return `Promise<void>` and **never reject**. The `.catch` blocks log and swallow. This is intentional: a mail failure must not roll back the shipped/delivered/lost act.
- `enqueueEmail` itself never rejects (it logs internally), so the `void` + eslint-disable pattern is safe but necessary to satisfy the linter.
- `mailShipped` uses `Promise.resolve()` for digital fulfillments rather than `undefined` to keep the return type uniform.
- Stryker mutation-testing disable markers surround the `logger` calls (they are pure side-effects that mutation testing cannot meaningfully mutate).
- The file uses `.then`/`.catch` promise chains rather than `async`/`await`, consistent with the codebase's promise-chain style in this layer.
