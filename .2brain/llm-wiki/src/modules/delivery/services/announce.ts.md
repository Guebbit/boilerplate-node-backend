---
source: src/modules/delivery/services/announce.ts
sha256: b45aee53a45d851595d3ac87e67bcda79af7999512475c64482e107c59c56b11
generated_at: 2026-11-14T19:44:06.738869+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/announce.ts

## Purpose

Writes delivery events to the transactional outbox **and** appends the matching order-timeline row inside the same Mongoose session, so the narrative history commits atomically with the state change it describes. All outbox events are keyed on the order ID to preserve per-order ordering.

## Key elements

- **`shipmentPayload`** (private) – Builds the shared `{ orderId, shipmentId, fulfillmentOrderId, lines }` body for all `shipment.*` events.
- **`announceShipped`** – Appends a `shipment_shipped` timeline row, then enqueues `SHIPMENT_SHIPPED`. Accepts an optional `actor` and `remainingUnits` (omitted for digital).
- **`announceDelivered`** – Appends a `shipment_delivered` timeline row, then enqueues `SHIPMENT_DELIVERED`.
- **`LossNotice`** (interface) – Buyer-facing data for a loss: `userId`, staff `message`, `owed` lines, `expectedAt`, `orderNumber`.
- **`announceLost`** – Appends a `shipment_lost` timeline row (reason code only), then enqueues `SHIPMENT_LOST` carrying the full `LossNotice` fields for mail/inbox.
- **`noticeTheBuyer`** (private) – Conditionally enqueues `FULFILLMENT_ORDER_HOLD_NOTICED` when the hold reason warrants a buyer notice (via `holdNeedsBuyerNotice`).
- **`announceHeld`** – Appends a `fulfillment_held` timeline row, enqueues `FULFILLMENT_ORDER_HELD`, then calls `noticeTheBuyer`.
- **`announceReleased`** – Appends a `fulfillment_released` timeline row, enqueues `FULFILLMENT_ORDER_RELEASED`.
- **`announceCanceled`** – Enqueues `FULFILLMENT_ORDER_CANCELED` only (no timeline row; the order's own `canceled` row covers it).
- **`recordRemainderCanceled`** – Appends a `remainder_canceled` timeline row for a remainder canceled *after* a partial shipment; intentionally separate from `announceCanceled`.
- **`announceDelayed`** – Enqueues `FULFILLMENT_ORDER_DELAYED` and appends a `delay_notice_sent` timeline row (truncated in source).

## Relationships

- **`src/kernel/outbox.ts`** – Calls `enqueueOutboxEvent` for every event write; passes the `ClientSession` so the outbox row joins the act's transaction.
- **`src/modules/delivery/domain/index.ts` / `hold-notice.ts`** – Imports `holdNeedsBuyerNotice` and `holdNoticeOf` to decide *whether* and *what* buyer notice accompanies a hold.
- **`src/modules/delivery/model.ts`** – Uses `FulfillmentOrderDocument` and `ShipmentDocument` types for parameters and payload extraction.
- **`src/modules/delivery/events.ts`** – Imports all event-name constants (`SHIPMENT_SHIPPED`, `SHIPMENT_LOST`, `FULFILLMENT_ORDER_HELD`, etc.) and the `FulfillmentOrderDelayed` / `ShipmentLostOwedLine` types.
- **Caller services** (`ship.ts`, `deliver.ts`, `lost.ts`, `holds.ts`, `cancel-remainder.ts`, `fulfill.ts`, `found.ts`, `notice.ts`, `split.ts`) – Each imports the relevant `announce*` / `recordRemainderCanceled` function and invokes it within its own act's transaction.
- **`src/modules/delivery/tests/unit/fulfillment.test.ts`** – Exercises the announcement path as part of fulfillment tests.

## Notes

- **Timeline vs. outbox content asymmetry (by design):** Timeline rows carry only IDs, codes, and timestamps. Free-text staff notes and buyer-facing messages live on the domain document (with its own retention clock) or in the outbox event payload (for mail/inbox delivery). The webhook path omits those messages.
- **`announceCanceled` deliberately skips the timeline row.** A whole-order cancellation already writes an order-level `canceled` row; adding a fulfillment-level row would be redundant. Use `recordRemainderCanceled` instead when a *remainder* is canceled post-shipment.
- **Ordering guarantee:** Every `enqueueOutboxEvent` call passes `String(shipment.orderId)` (or `fulfillmentOrder.orderId`) as the partition key, ensuring events for a single order are consumed in write order.
- **`actor` is optional everywhere.** It is `undefined` when the system (e.g., stock arrival) performs the action rather than a staff member.
- **`remainingUnits` on `announceShipped`** is conditionally spread into the payload—absent for digital fulfillments where no further shipments are expected.
