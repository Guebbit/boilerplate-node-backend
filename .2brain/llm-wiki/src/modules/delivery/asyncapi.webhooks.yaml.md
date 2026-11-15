---
source: src/modules/delivery/asyncapi.webhooks.yaml
sha256: ba146c9d1626308be8a2e7cdeae47563e287928893e99f15985ba164e80131fc
generated_at: 2026-11-14T19:37:23.688543+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/asyncapi.webhooks.yaml

## Purpose

AsyncAPI fragment that declares the delivery module's three outbound webhook events (`shipment.shipped`, `shipment.delivered`, `shipment.lost`). It is not a standalone document; a build script merges it into the root `webhooks/asyncapi.yaml` contract, and it disappears from the published contract the moment the delivery module is unregistered.

## Key elements

- **`channels`** – Three channel entries (`shipment.shipped`, `shipment.delivered`, `shipment.lost`), each with an `x-read-rule: display:Order`, a `$ref` to the shared `subscriberEndpoint` server, and a single message.
- **`operations`** – Three `send` operations (`webhookShipmentShipped`, `webhookShipmentDelivered`, `webhookShipmentLost`) that bind each channel to its message and carry a description tying the event to its domain-event source (`delivery/services/ship.ts`, `deliver.ts`, `lost.ts`).
- **`components.messages`** – `ShipmentShippedEvent`, `ShipmentDeliveredEvent`, `ShipmentLostEvent`; each pairs the shared `WebhookHeaders` schema with an envelope schema.
- **`components.schemas`**
  - `ShipmentPayload` – common shape: `orderId`, `shipmentId`, `fulfillmentOrderId`, `lines[]` (productId + quantity).
  - `ShipmentLostPayload` – extends the above with a required `reason` enum (`lost` | `damaged`).
  - `ShipmentShippedEnvelope` / `ShipmentDeliveredEnvelope` / `ShipmentLostEnvelope` – Standard Webhooks envelope (`type`, `timestamp`, `data`) wrapping the respective payload; `type` is a single-value enum carrying the event name.

## Relationships

- **`src/modules/delivery/module.ts`** – The module's `publicEvents` array is the runtime source that actually fires these three events; this file is the *contract* (schema) side of the same events. Removing the module removes both the firing code and (via the bundler) the contract fragment.
- **`src/modules/example/asyncapi.webhooks.yaml`** – A sibling fragment in another module; both are merged into the same `webhooks` section of the root AsyncAPI document. They share the same structural conventions (envelope shape, `x-read-rule`, server `$ref`) but define disjoint channel/event sets.

## Notes

- This file is a **fragment**: the `$ref`s to `#/servers/subscriberEndpoint` and `#/components/schemas/WebhookHeaders` resolve only after the bundler merges it into the root document. Opening it in isolation will show unresolved references.
- `ShipmentShippedEnvelope` and `ShipmentDeliveredEnvelope` share the same `ShipmentPayload`; only `ShipmentLostPayload` adds the `reason` field.
- The `title` on each `type` field (e.g. `ShipmentShippedEventType`) is the generated model name—convention shared with other module fragments (see `orders/asyncapi.webhooks.yaml`).
- `shipment.shipped` fires **once per shipment**, not once per order. An order shipped in two waves produces two events; the order reaches terminal `shipped` status on the last one.
- `shipment.lost` intentionally carries only the `reason` enum, never a free-text staff note or buyer-facing message.
- Status-only overrides that force shipments without a physical parcel firing do **not** emit `shipment.shipped`.
