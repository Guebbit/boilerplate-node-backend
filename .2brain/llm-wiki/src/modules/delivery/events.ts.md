---
source: src/modules/delivery/events.ts
sha256: d50811f972e14d074d1fcbc3e013cce87186e5b8f676e53b67de329df0b916a3
generated_at: 2026-11-14T19:40:45.198409+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/events.ts

## Purpose

Defines the domain-event payload types for the delivery module and registers them into the kernel's shared `DomainEventMap` via TypeScript module augmentation. Every payload here corresponds to an event that rides the transactional outbox, written in the same transaction as the act that caused it. `shipment.*` events are public (projected into the webhooks catalogue); `fulfillment_order.*` events are internal.

## Key elements

- **`ShipmentEventLine` / `ShipmentEventPayload`** — Shared line-item shape and base payload (`orderId`, `shipmentId`, `fulfillmentOrderId`, `lines`) for both shipped and delivered events.
- **`ShipmentLostOwedLine` / `ShipmentLostPayload`** — Payload for the lost event; extends the base with `orderNumber`, `reason` (`ShipmentLostReason`), optional `userId`/`message`, `owed` lines the shelf could not cover, and `expectedAt`.
- **`ShipmentShippedPayload`** — Payload for the shipped event; adds optional `remainingUnits` (internal; the webhook omits it).
- **`FulfillmentOrderDelayed`** — Payload for the delayed event; carries `agreedAt`, `promisedAt?`, `shipCountry?`, `expectedAt?`, and `reason` (`'moved' | 'due'`).
- **`FulfillmentOrderHoldNoticed`** — Payload for the hold-noticed event; buyer-safe by construction, carrying a `notice` discriminator (`check_address` | `delayed`) and optional `message`.
- **`declare module '@kernel/events'`** — Augments `DomainEventMap` with eight event keys: `shipment.shipped`, `shipment.delivered`, `shipment.lost`, `fulfillment_order.held`, `fulfillment_order.hold_noticed`, `fulfillment_order.released`, `fulfillment_order.canceled`, `fulfillment_order.delayed`.
- **String constants** (`SHIPMENT_SHIPPED`, `SHIPMENT_DELIVERED`, `SHIPMENT_LOST`, `FULFILLMENT_ORDER_HELD`, `FULFILLMENT_ORDER_HOLD_NOTICED`, `FULFILLMENT_ORDER_RELEASED`, `FULFILLMENT_ORDER_CANCELED`, `FULFILLMENT_ORDER_DELAYED`) — Named exports matching the `DomainEventMap` keys, for use at emit/consume sites.

## Relationships

- **`src/types/index.ts`** — Imports `FulfillmentHeldParamsNotice` and `ShipmentLostReason` from `@types` for use in payload definitions.
- **`src/modules/delivery/module.ts`** — Its `publicEvents` list projects the `shipment.*` events into the `webhooks` module's public catalogue.
- **`src/modules/delivery/services/notify.ts`** — Consumes the public `shipment.*` events to mail the buyer.
- **`src/modules/delivery/index.ts`** — Barrel file; re-exports from this module for consumers outside the delivery directory.

## Notes

- `userId` is optional on several payloads because the buyer's account may have been erased; downstream consumers must handle its absence (no inbox to write to).
- `message` on `ShipmentLostPayload` and `FulfillmentOrderHoldNoticed` is free-text written by staff; the webhook projection explicitly excludes it.
- `shipment.shipped` fires once per shipment, so a split shipment produces multiple events. It is *not* fired for forced shipments brought in by an admin status override.
- `fulfillment_order.delayed` is fire-and-forget: the shop tells the buyer the date moved or will be missed but never asks for consent or cancels on its own.
- `promisedAt` on `FulfillmentOrderDelayed` is absent once an earlier notice informed the buyer there was no date; `tasks` uses it together with `shipCountry` to decide on consent reminders.
