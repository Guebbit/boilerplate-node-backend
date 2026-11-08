---
source: src/modules/delivery/services/announce.ts
sha256: 98186a27cd1e1b4683acf2ddb3821f536d824a5015beaefb46216d6aa2eca484
generated_at: 2026-11-08T05:33:50.048034+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/announce.ts

## Purpose

The single "commit" point where delivery state changes are recorded: each function writes an outbox event **and** the matching row on the order's human-readable timeline, both inside the caller's Mongoose transaction, so the narrative and the fact commit atomically.

## Key elements

- **`announceShipped`** – Appends a `shipment_shipped` timeline row, then enqueues `SHIPMENT_SHIPPED`. Accepts an optional `remainingUnits` (omitted for digital fulfillments).
- **`announceDelivered`** – Appends `shipment_delivered`, enqueues `SHIPMENT_DELIVERED`.
- **`announceLost`** – Appends `shipment_lost` (ids + reason code only), enqueues `SHIPMENT_LOST` with buyer-facing fields (`message`, `owed`, `expectedAt`) that the timeline row deliberately omits.
- **`LossNotice`** *(interface)* – The buyer-facing payload for a loss: optional `userId`, `message`, `owed` lines, `expectedAt`.
- **`announceHeld`** – Appends `fulfillment_held`, enqueues `FULFILLMENT_ORDER_HELD`, then conditionally fires `FULFILLMENT_ORDER_HOLD_NOTICED` via the internal `noticeTheBuyer` helper (gated by `holdNeedsBuyerNotice`).
- **`announceReleased`** – Appends `fulfillment_released`, enqueues `FULFILLMENT_ORDER_RELEASED`.
- **`announceCanceled`** – Enqueues `FULFILLMENT_ORDER_CANCELED` only; writes **no** timeline row (the order's own `canceled` row already covers it).
- **`recordRemainderCanceled`** – Appends a `remainder_canceled` timeline row only; enqueues **no** outbox event. Exists separately from `announceCanceled` for that reason.
- **`announceDelayed`** – Appends `delay_notice_sent` (reason + expected date), enqueues `FULFILLMENT_ORDER_DELAYED`.
- **`shipmentPayload`** *(internal)* – Builds the shared `{ orderId, shipmentId, fulfillmentOrderId, lines }` shape for all `shipment.*` events.

## Relationships

- **`@kernel/outbox`** – Every function calls `enqueueOutboxEvent`; this file is a primary consumer of the outbox API.
- **`@modules/orders`** – Calls `orderService.appendTimeline` for every timeline write; imports the `OrderDocument` type used by `announceHeld` / `noticeTheBuyer`.
- **`../domain` (hold-notice.ts)** – Uses `holdNeedsBuyerNotice` and `holdNoticeOf` to decide whether and how to notify the buyer on a hold.
- **`../events`** – Imports all event-type constants (`SHIPMENT_SHIPPED`, `FULFILLMENT_ORDER_HELD`, etc.) and the `FulfillmentOrderDelayed` / `ShipmentLostOwedLine` payload types.
- **`../model`** – Imports `FulfillmentOrderDocument` and `ShipmentDocument` types used throughout.
- **Service callers** – `ship.ts`, `deliver.ts`, `lost.ts`, `holds.ts`, `cancel-remainder.ts`, `fulfill.ts`, and `notice.ts` each invoke the relevant `announce*` / `record*` function after mutating the delivery state, passing their transaction session.
- **`tests/unit/fulfillment.test.ts`** – Exercises the announcement flow as part of fulfillment integration tests.

## Notes

- **Timeline rows carry IDs and codes only.** Free-text (staff notes, buyer messages) is intentionally absent from timeline data; it lives on the fulfillment order or in the outbox event, each with its own retention clock.
- **Outbox events carry buyer-facing text** (`message`, `owed`) for mail/inbox consumption; the webhook consumer is expected to strip those fields.
- **All writes are keyed on `orderId`** (the third arg to `enqueueOutboxEvent`) so events for a given order remain in sequence.
- **Every function requires the caller's `ClientSession`**; this module never opens its own transaction.
- The file is a pure `@module` (no default export); consumers import named functions.
- `announceCanceled` and `recordRemainderCanceled` are intentionally split: the former has no timeline row, the latter has no outbox event. Don't merge them.
