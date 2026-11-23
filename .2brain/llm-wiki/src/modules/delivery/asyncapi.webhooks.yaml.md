---
source: src/modules/delivery/asyncapi.webhooks.yaml
source_sha256: ba146c9d1626308be8a2e7cdeae47563e287928893e99f15985ba164e80131fc
context_sha256: d452085699d5313907b2a710b920c325b4b36b39cb4f920f8fde58abb0bdf502
generated_at: 2026-11-22T04:44:35.828144+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/asyncapi.webhooks.yaml

## Purpose
AsyncAPI fragment declaring the delivery module's outbound webhook events: `shipment.shipped`, `shipment.delivered` and `shipment.lost`. It is not a standalone document. It refs `#/servers/subscriberEndpoint` and `#/components/schemas/WebhookHeaders` (declared in `src/modules/webhooks/asyncapi.yaml`). The bundler merges it into the `webhooks` section only while the module exists (`scripts/contracts/asyncapi-section-fragments.ts`). `GET /webhooks/events` lists these events only while the module is registered, so deleting the module removes them from the contract.

## Key elements
- **Channels** (`shipment.shipped`, `shipment.delivered`, `shipment.lost`): each has `address` equal to the name, `x-read-rule: display:Order`, the shared `subscriberEndpoint` server, and one message.
- **Operations** (`action: send`): `webhookShipmentShipped`, `webhookShipmentDelivered`, `webhookShipmentLost`. Each is one-to-one with a domain event, produced by `src/modules/delivery/services/ship.ts`, `deliver.ts` and `lost.ts` respectively.
- **Messages**: `ShipmentShippedEvent`, `ShipmentDeliveredEvent` and `ShipmentLostEvent`. Each uses `WebhookHeaders` as headers and its own envelope schema as payload.
- **Envelope schemas** (`ShipmentShippedEnvelope`, `ShipmentDeliveredEnvelope`, `ShipmentLostEnvelope`): the Standard Webhooks shape `{ type, timestamp, data }`. `type` is a single-value enum with a `title` (e.g. `ShipmentShippedEventType`), `timestamp` is a date-time string, and `additionalProperties` is false.
- **`ShipmentPayload`**: `orderId`, `shipmentId`, `fulfillmentOrderId` and `lines[]` (`productId`, `quantity` ≥ 1). It is used by the shipped and delivered envelopes.
- **`ShipmentLostPayload`**: the same fields plus a required `reason` enum (`lost` | `damaged`).

## Relationships
- `src/modules/delivery/asyncapi.domain-events.yaml`: the sibling contract for the internal domain events. Each webhook here is described as one-to-one with a `shipment.*` domain event.
- `src/modules/example/asyncapi.webhooks.yaml`: another module's webhook fragment, merged by the same mechanism.

## Notes
- A comment in the file points to another module's webhook fragment (the orders module's) for the convention that `title` on the envelope `type` names the generated model.
- The module's `publicEvents` is what actually fires these events.
- Shipped fires once per shipment, so an order shipped in two goes fires it twice. The order reaching `shipped` is the last one.
- Forced shipments from a status-only override fire nothing, because no parcel was recorded as leaving.
- A digital fulfillment fires `shipment.delivered` right after `shipment.shipped`.
- After `shipment.lost`, the units return to the fulfillment order. A replacement `shipment.shipped` follows, and the order may step back `shipped → processing` (an `order.status_changed`).
- The lost payload carries only the reason code, never staff's note or the buyer-facing sentence.
- `ShipmentLostEvent` is declared first in `components.messages` and the schemas, unlike the shipped/delivered order. This is cosmetic.
