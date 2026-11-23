---
source: src/modules/delivery/asyncapi.domain-events.yaml
source_sha256: 1e4558406d0e5f04797364affcfe64c1a4d7096f48f51b2ca7d7e77d395f97a8
context_sha256: 46e7bd9cdaf5d661ca1ed37aec24dde8617d254b6655c42e4ebbc95b12a435b8
generated_at: 2026-11-22T04:44:19.448988+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/asyncapi.domain-events.yaml

## Purpose
An AsyncAPI fragment (not a full document) declaring the domain events the delivery module emits. Per its header, it is merged into the `domain-events` section (`shared/contracts/asyncapi.domain-events.yaml`) and is backend-only. It defines the channels, send operations, message wrappers and payload schemas for shipment and fulfillment-order lifecycle events.

## Key elements
- **Channels** (all `x-transport: outbox`, address is the channel name minus the `domain.` prefix):
  - `domain.shipment.shipped`: a shipment left, with some or all of an order's goods. Fires once per shipment. Not fired for forced shipments from an admin status override. The module mails the buyer from it (`src/modules/orders/services/notify.ts`).
  - `domain.shipment.delivered`: a shipment arrived. A digital fulfillment fires it right after `shipment.shipped`.
  - `domain.shipment.lost`: staff reported a shipment lost or damaged. Written in the same transaction that reopened its units. This module mails the buyer from it, and `notifications` writes the inbox row.
  - `domain.fulfillment_order.held`: staff put an order on hold, or the awaited stock did not arrive.
  - `domain.fulfillment_order.hold_noticed`: a hold the buyer needs to act on or read (address check, staff message). A bare delay or `awaiting_stock` fires nothing. `notifications` creates a `fulfillment-held` inbox row, and this module sends the matching email.
  - `domain.fulfillment_order.released`: a hold ended and the order may ship.
  - `domain.fulfillment_order.canceled`: the remainder, or the whole order, was canceled.
  - `domain.fulfillment_order.delayed`: a waiting preorder's buyer was told its date moved or will be missed. Written in the same transaction as the change. `notifications` writes a `fulfillment-delayed` inbox row, and this module sends the email. The shop only tells the buyer; it asks nothing and cancels nothing.
- **Operations**: one `send` operation per channel (e.g. `domainShipmentShipped`, `domainFulfillmentOrderHeld`, `domainFulfillmentOrderDelayed`), each with a `summary` and a message reference.
- **Messages** (`components.messages`): one per event, named `<Event>DomainEvent` (e.g. `ShipmentShippedDomainEvent`), each pointing at a `...DomainEventPayload` schema.
- **Payload schemas** (`components.schemas`): objects with `additionalProperties: false`. The shipment payloads share `orderId`, `shipmentId`, `fulfillmentOrderId` and a `lines` array of `{productId, quantity}`.
  - `ShipmentShippedDomainEventPayload` adds an optional `remainingUnits`. It is absent for digital fulfillment and is internal; the webhook omits it.
  - `ShipmentLostDomainEventPayload` additionally requires `orderNumber`, `reason` and `owed`.

## Relationships
- `src/modules/delivery/asyncapi.webhooks.yaml`: the sibling delivery fragment. The `remainingUnits` description says the webhook omits it, which implies the webhook payload is a trimmed form of the shipped event.
- `src/modules/delivery/module.ts`: the delivery module's code. This is the module the events belong to and are emitted from. The file itself does not describe how it is wired in.
- `src/modules/example/asyncapi.domain-events.yaml`: a peer fragment from another module, merged into the same shared `domain-events` contract.

## Notes
- Because it is a fragment, `$ref`s such as `#/components/messages/...` resolve only after merging.
- Operation message refs use the `#/channels/<channel>/messages/<Name>` form. One ref is split across lines with a `\` continuation inside a double-quoted string.
- Shipped and delivered events fire per shipment, not per order.
- Several events are consumed by both this module (email) and the `notifications` module (inbox row) from the same event.
