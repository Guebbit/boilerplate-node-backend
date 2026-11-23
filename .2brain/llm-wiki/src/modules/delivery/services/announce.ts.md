---
source: src/modules/delivery/services/announce.ts
source_sha256: 2c4f65bfa4a04525b786875a5f9bfaa50e0df4b772950d028fba82da9c0d9a00
context_sha256: d674fe8d754805cef6d65ae7c16959c6d00f8f8416fa5265bd55991ddf886f59
generated_at: 2026-11-22T04:52:58.395087+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/services/announce.ts

## Purpose
Writes delivery's domain events to the outbox and the matching order-timeline rows, inside the calling act's transaction (`ClientSession`). History therefore commits atomically with the fact it describes. Timeline rows carry only ids and codes, never the hold note, which is reaped on its own retention clock.

## Key elements
- `shipmentPayload` (private): shared payload for `shipment.*` events (orderId, shipmentId, fulfillmentOrderId, lines with productId/quantity).
- `announceShipped(shipment, session, actor?, remainingUnits?)`: timeline `shipment_shipped` (includes number and optional `trackingCode`), then outbox `SHIPMENT_SHIPPED`. `remainingUnits` is added to the payload only when defined.
- `announceDelivered(shipment, session, actor?)`: timeline `shipment_delivered`, then outbox `SHIPMENT_DELIVERED`.
- `LossNotice` (interface): what the buyer is told about a loss (`userId?`, `message?`, `owed` lines, `expectedAt?`, `orderNumber`).
- `announceLost(shipment, notice, session, actor?)`: timeline `shipment_lost` (reason code only, defaulting to `'lost'`), then outbox `SHIPMENT_LOST`. The event payload additionally carries the buyer-facing message, owed lines, and ISO `expectedAt`.
- `noticeTheBuyer` (private): enqueues `FULFILLMENT_ORDER_HOLD_NOTICED` only if the hold has a reason and `holdNeedsBuyerNotice` says so. The notice kind is `'check_address'` or `'delayed'`, derived from `holdNoticeOf`.
- `announceHeld(fulfillmentOrder, order, session, actor?)`: timeline `fulfillment_held` (reason defaults to `'other'`), outbox `FULFILLMENT_ORDER_HELD`, then `noticeTheBuyer`.
- `announceReleased(fulfillmentOrder, session, actor?)`: timeline `fulfillment_released`, then outbox `FULFILLMENT_ORDER_RELEASED`.
- `announceCanceled(fulfillmentOrder, session)`: outbox `FULFILLMENT_ORDER_CANCELED` only, with no timeline row.
- `recordRemainderCanceled(fulfillmentOrder, session, actor?)`: timeline `remainder_canceled` only.
- `announceDelayed(delayed, session)`: writes `FULFILLMENT_ORDER_DELAYED` and the timeline's `delay_notice_sent` (reason and expected date). Its body is cut off in the source I was given, so details beyond that are not documented here.

## Relationships
- `src/kernel/outbox.ts`: `enqueueOutboxEvent(type, payload, key, session)` is the sole outbox writer. Every event is keyed on the order id so a given order's events stay in order.
- `src/modules/delivery/domain/hold-notice.ts` and `src/modules/delivery/domain/index.ts`: `holdNeedsBuyerNotice` and `holdNoticeOf` (imported from `../domain`) decide whether and what kind of hold notice is sent.
- `src/modules/delivery/events.ts`: supplies the event-name constants and the `FulfillmentOrderDelayed` and `ShipmentLostOwedLine` types.
- `src/modules/delivery/model.ts`: supplies the `ShipmentDocument` and `FulfillmentOrderDocument` types.
- Sibling services (`ship`, `deliver`, `lost`, `holds`, `found`, `fulfill`, `split`, `cancel-remainder`, `notice`) are neighbors in the dependency graph. I cannot confirm from the shown content which of them call which `announce*` function.
- `src/modules/delivery/tests/unit/fulfillment.test.ts` is also a graph neighbor; its interaction is not visible in the shown content.

## Notes
- Every function takes the act's `session` and must be called inside that transaction.
- Ordering is timeline row first, then the outbox event. For `announceHeld`, the buyer notice follows both.
- `announceCanceled` deliberately has no timeline row. `recordRemainderCanceled` is separate because `announceCanceled` also runs when a canceled order takes its fulfillment orders with it, and the order's own `canceled` row already covers that case.
- The loss event carries the buyer-facing sentence for the mail and inbox row, but the webhook leaves it out. The timeline row never carries it, nor staff's note.
- The hold note stays on the fulfillment order, which has its own retention clock. Timeline rows and the `held` event carry only the reason code. The `hold_noticed` event does include `holdMessage` when present, so it reaches the mail and inbox row.
- Timeline rows are written through `orderService.appendTimeline` from `@modules/orders`, which `OrderDocument` (supplying `orderNumber` and `userId` for hold notices) also comes from. `shopDayOf` from `@modules/shop` is imported, but its use is not visible in the shown portion.
