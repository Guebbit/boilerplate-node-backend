---
source: src/modules/delivery/services/announce.ts
sha256: 2b54afeb20bb6b64a15a9af5c9c36bae36ec972bd0836ccdcae017564ff4d084
generated_at: 2026-10-29T03:37:59.897388+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/announce.ts

## Purpose

Announces delivery-domain state transitions to two consumers in the same transaction: the **outbox** (event stream for webhooks, mail, inbox) and the **order timeline** (human-readable history row). It exists so that the narrative (timeline) and the fact (event) commit atomically with the domain mutation, and so that free-text notes are never duplicated into the timeline where they have a different retention clock than the event payload.

## Key elements

- **`shipmentPayload(shipment)`** – Builds the shared `{ orderId, shipmentId, fulfillmentOrderId, lines }` object for every `shipment.*` event.
- **`announceShipped`** – Appends a `shipment_shipped` timeline row, then enqueues `SHIPMENT_SHIPPED`. Optionally includes `remainingUnits` for multi-shipment orders.
- **`announceDelivered`** – Appends a `shipment_delivered` timeline row, then enqueues `SHIPMENT_DELIVERED`.
- **`LossNotice`** (interface) – Buyer-facing loss details: optional `userId`, `message`, required `owed` lines, optional `expectedAt`.
- **`announceLost`** – Appends a `shipment_lost` timeline row (reason code only, **no** buyer message), then enqueues `SHIPMENT_LOST` which **does** carry the buyer message and owed lines.
- **`noticeTheBuyer`** (private) – Conditionally enqueues `FULFILLMENT_ORDER_HOLD_NOTICED` when `holdNeedsBuyerNotice` is true (address check or staff-written delay message).
- **`announceHeld`** – Appends `fulfillment_held` timeline row, enqueues `FULFILLMENT_ORDER_HELD`, then delegates to `noticeTheBuyer`.
- **`announceReleased`** – Appends `fulfillment_released` timeline row, enqueues `FULFILLMENT_ORDER_RELEASED`.
- **`announceCancelled`** – Enqueues `FULFILLMENT_ORDER_CANCELLED` **only** (no timeline row), because a full-order cancellation already writes its own row.
- **`recordRemainderCancelled`** – Writes a `remainder_cancelled` timeline row **only** (no event); used when a remainder is cancelled after a partial shipment.
- **`announceDelayed`** – Appends a `delay_notice_sent` timeline row, enqueues `FULFILLMENT_ORDER_DELAYED`. Takes a `FulfillmentOrderDelayed` payload rather than a document.

## Relationships

- **`src/kernel/outbox.ts`** – Imports `enqueueOutboxEvent`; every announce function writes its event through this single helper, passing a `ClientSession` for transactional atomicity.
- **`src/modules/delivery/domain/index.ts` / `hold-notice.ts`** – Imports `holdNeedsBuyerNotice` and `holdNoticeOf` to decide *whether* and *what kind* of buyer notice a hold warrants.
- **`src/modules/delivery/events.ts`** – Source of all event-name constants (`SHIPMENT_SHIPPED`, `SHIPMENT_LOST`, `FULFILLMENT_ORDER_HELD`, …) and the `FulfillmentOrderDelayed` / `ShipmentLostOwedLine` types.
- **`src/modules/delivery/model.ts`** – Provides the `ShipmentDocument` and `FulfillmentOrderDocument` types that every announce function accepts.
- **Caller services** (`ship.ts`, `deliver.ts`, `lost.ts`, `holds.ts`, `fulfill.ts`, `found.ts`, `cancel-remainder.ts`, `notice.ts`, `split.ts`) – Perform the domain mutation, then call the matching `announce*` / `record*` function within the same Mongoose session.
- **`src/modules/delivery/tests/unit/fulfillment.test.ts`** – Exercises the announcement path as part of fulfillment flow tests.

## Notes

- **Timeline rows never carry free text.** The hold note, buyer message, and staff comment stay on the domain document (or in the outbox event payload) because they have a different retention lifecycle. The timeline gets only ids and reason codes.
- **`announceCancelled` is timeline-less by design.** A full order cancellation already writes its own `cancelled` row on the order; adding another would duplicate. Use `recordRemainderCancelled` when you need a visible "remainder cancelled" row without the event.
- **`noticeTheBuyer` is the only conditional branch in this file.** All other announce functions fire unconditionally; the hold-noticed event is the one that can be a no-op.
- **All outbox events are keyed on `orderId`** (the third argument to `enqueueOutboxEvent`) so that per-order events maintain ordering in the stream.
- **`announceDelayed` diverges from the document pattern:** it accepts a pre-shaped `FulfillmentOrderDelayed` object rather than a Mongoose document, because the caller has already composed the buyer-facing fields.
