---
source: src/modules/delivery/services/announce.ts
sha256: b8a784e6e744992b62d832c40d9b72e8d9db4d1ed6d7347730b1c0306367e737
generated_at: 2026-10-14T15:26:47.388187+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/announce.ts

## Purpose

Transactional narration layer for delivery. Every act (ship, hold, release, delay, etc.) calls the appropriate `announce*` function to do two things atomically within the act's MongoDB transaction: append a human-readable row to the order's timeline and enqueue a domain event on the outbox. This file never mutates delivery state itself — it only records what already happened, so the history and the event commit together or not at all.

## Key elements

- **`announceShipped(shipment, session, actor?)`** — writes the `SHIPMENT_SHIPPED` outbox event and a `shipment_shipped` timeline row. Includes tracking code when present.
- **`announceDelivered(shipment, session, actor?)`** — writes the `SHIPMENT_DELIVERED` outbox event and a `shipment_delivered` timeline row.
- **`announceHeld(fulfillmentOrder, session, actor?)`** — writes the `FULFILLMENT_ORDER_HELD` event and a `fulfillment_held` timeline row carrying only the reason code (not free-text note).
- **`announceReleased(fulfillmentOrder, session, actor?)`** — writes the `FULFILLMENT_ORDER_RELEASED` event and a `fulfillment_released` timeline row. `actor` is omitted when stock arrival triggered the release.
- **`announceCancelled(fulfillmentOrder, session)`** — writes the `FULFILLMENT_ORDER_CANCELLED` outbox event **only** (no timeline row, by design).
- **`recordRemainderCancelled(fulfillmentOrder, session)`** — writes a `remainder_cancelled` timeline row **only** (no outbox event). Separate from `announceCancelled` because the whole-order cancellation path already logs a `cancelled` row on the order.
- **`announceDelayed(delayed, session)`** — writes the `FULFILLMENT_ORDER_DELAYED` event (payload is the `FulfillmentOrderDelayed` object as-is) and a `delay_notice_sent` timeline row with `expectedAt` / `answerBy` when set.
- **`announceWaitExpired(fulfillmentOrder, session)`** — writes the `FULFILLMENT_ORDER_WAIT_EXPIRED` event and a `wait_expired` timeline row.
- **`shipmentPayload`** (private) — builds the uniform `{orderId, shipmentId, fulfillmentOrderId, lines[]}` shape shared by both shipment events.

## Relationships

- **`@kernel/outbox`** — every `announce*` function calls `enqueueOutboxEvent` to emit the domain event within the caller's transaction.
- **`@modules/orders`** (`orderService.appendTimeline`) — every timeline write goes through the orders service; this file never writes to the order collection directly.
- **`../events`** — source of the event-name constants (`SHIPMENT_SHIPPED`, `FULFILLMENT_ORDER_HELD`, etc.) and the `FulfillmentOrderDelayed` payload type.
- **`../model`** — provides the `FulfillmentOrderDocument` and `ShipmentDocument` types that the functions accept.
- **Caller services** (`ship.ts`, `fulfill.ts`, `holds.ts`, `cancel-remainder.ts`, `preorder-sweep.ts`, `notice.ts`) — each invokes the relevant `announce*` function after performing its state mutation, passing the act's `ClientSession` so both the mutation and the narration commit atomically.
- **`tests/unit/fulfillment.test.ts`** — exercises the announce functions in the context of fulfillment flows.

## Notes

- **Cancelled vs. remainder-cancelled split is intentional.** `announceCancelled` omits the timeline row because the order-level `cancelled` entry already narrates it. `recordRemainderCancelled` exists solely for the partial-cancel-after-ship case. Don't merge them.
- **Timeline rows never carry the free-text hold note.** Only the reason code is recorded; the note stays on the fulfillment order where it has its own retention/deletion clock.
- **All outbox events are keyed on `orderId`** to guarantee per-order event ordering in the outbox.
- **`actor` is optional and nullable.** It is `undefined`/`null` whenever the system (sweep, stock arrival, wait expiry) triggered the act rather than a staff member.
- The module has no default export; all functions are named exports.
