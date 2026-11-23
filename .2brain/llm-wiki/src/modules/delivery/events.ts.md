---
source: src/modules/delivery/events.ts
source_sha256: 28b54961a50db5a140537ed4d0924f19ef4633357cc4e4f20d839e1e221c5ea1
context_sha256: b57e6a0cc2335d8c63925abcbb24e09e40580ef32f9309b0a226ee9a599036e0
generated_at: 2026-11-22T04:49:44.868122+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/events.ts

## Purpose
Declares the domain events the delivery module emits: event-name constants and payload type aliases. The payload shapes are generated from `./asyncapi.domain-events.yaml` and surfaced here under the names the module's callers already use. Every event goes through the transactional outbox, written in the same transaction as the act that caused it. `shipment.*` events are projected into the `webhooks` public catalogue via `module.ts`'s `publicEvents`; `fulfillment_order.*` events are internal.

## Key elements
- **Event name constants** (each `satisfies DomainEventName`, so a name missing from the kernel registry fails type-checking):
  - `SHIPMENT_SHIPPED`, `SHIPMENT_DELIVERED`, `SHIPMENT_LOST`
  - `FULFILLMENT_ORDER_HELD`, `FULFILLMENT_ORDER_HOLD_NOTICED`, `FULFILLMENT_ORDER_RELEASED`, `FULFILLMENT_ORDER_CANCELED`, `FULFILLMENT_ORDER_DELAYED`
- **Payload types**, all indexed from `DomainEventMap`:
  - `ShipmentEventPayload`: shared payload of both `shipment.*` events (indexed from `shipment.delivered`).
  - `ShipmentEventLine`: one per-product line of that payload.
  - `ShipmentLostPayload`: `shipment.lost` payload, which adds the reason and what the buyer is told.
  - `ShipmentLostOwedLine`: an entry of `owed`, a product the shelf could not cover.
  - `ShipmentShippedPayload`: `shipment.shipped` payload, which adds what the buyer's mail says.
  - `FulfillmentOrderDelayed`: dates only, nothing the buyer must answer.
  - `FulfillmentOrderHoldNoticed`: a hold the buyer can act on or should read about.

## Relationships
- Imports the `DomainEventMap` and `DomainEventName` types from `src/kernel/events.ts`, which is the source of the generated payload types and the valid event names.
- `src/modules/delivery/module.ts` uses the `shipment.*` events for `publicEvents`, as noted in the file header.
- The remaining neighbors (`src/modules/delivery/index.ts`, `src/modules/delivery/services/announce.ts`, `src/modules/delivery/services/notice.ts`, `src/modules/delivery/services/notify.ts`, and `src/modules/delivery/tests/integration/override-sync.test.ts`) are in the module's dependency graph around this file. This file doesn't show how they use it.

## Notes
- This file holds no runtime logic, only string constants and types. Change payload shapes in the AsyncAPI YAML, not here.
- `ShipmentEventPayload` is derived from `shipment.delivered`, but its doc comment says it is shared by both `shipment.*` events.
