---
source: src/modules/delivery/asyncapi.webhooks.yaml
sha256: c1ecc3e29ded035f564b81e6cf6595cc6d140b091b36bc1b3660016eee3b8b5c
generated_at: 2026-11-08T05:25:41.660049+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/asyncapi.webhooks.yaml

## Purpose

AsyncAPI **fragment** (not a standalone document) that declares the delivery module's outbound webhook events under the `shipment.*` namespace. It defines the channels, operations, message components, and payload/envelope schemas that subscribers receive. The bundler (`scripts/contracts/asyncapi-section-fragments.ts`) merges it into the top-level `webhooks/asyncapi.yaml` only while the delivery module is registered; deleting the module removes these events from the contract and from `GET /webhooks/events`.

## Key elements

- **`channels`** — Three channels (`shipment.shipped`, `shipment.delivered`, `shipment.lost`), each bound to `#/servers/subscriberEndpoint` and carrying one message.
- **`operations`** — Three `send` operations (`webhookShipmentShipped`, `webhookShipmentDelivered`, `webhookShipmentLost`), each mapped 1-to-1 with its channel and a domain-event service (`ship.ts`, `deliver.ts`, `lost.ts`).
- **`components.messages`** — `ShipmentShippedEvent`, `ShipmentDeliveredEvent`, `ShipmentLostEvent`; each wraps the standard Webhooks envelope (`{ type, timestamp, data }`) with `#/components/schemas/WebhookHeaders`.
- **`components.schemas.ShipmentPayload`** — Shared body for shipped/delivered: `orderId`, `shipmentId`, `fulfillmentOrderId`, `lines` (product + quantity array).
- **`components.schemas.ShipmentLostPayload`** — Extends `ShipmentPayload` with a `reason` enum (`lost` | `damaged`).
- **Envelope schemas** (`ShipmentShippedEnvelope`, `ShipmentDeliveredEnvelope`, `ShipmentLostEnvelope`) — Standard Webhooks shape with a single-value `type` enum and the corresponding payload as `data`.

## Relationships

- **`src/modules/delivery/module.ts`** — Registers the module; its `publicEvents` export is the runtime source that actually fires each event. The fragment is merged into the public contract and listed by `GET /webhooks/events` only while this module is present.
- **`src/modules/example/asyncapi.webhooks.yaml`** — Sibling fragment in the example module; shares the same structural conventions (envelope shape, `$ref` to shared components) and serves as the reference/template for authoring new module webhook fragments.

## Notes

- This file **cannot be validated in isolation**: it `$ref`s `#/servers/subscriberEndpoint`, `#/components/schemas/WebhookHeaders`, and `#/components/schemas/Id`, all declared in the parent `webhooks/asyncapi.yaml`. Lint or validation must run against the merged document.
- The `type` field in each envelope carries a `title` (e.g. `ShipmentShippedEventType`) that names the **generated model**; the comment points to `orders/asyncapi.webhooks.yaml` for the convention.
- `shipment.delivered` fires immediately after `shipment.shipped` for digital fulfillments — consumers must not assume a time gap.
- `shipment.lost` carries only the `reason` enum, never free-text staff notes or buyer-facing sentences.
- An order shipped in multiple "goes" fires `shipment.shipped` once per go; the order reaches `shipped` status on the last one.
- Status-only overrides that force shipments produce **no** `shipment.shipped` event (no parcel actually left).
