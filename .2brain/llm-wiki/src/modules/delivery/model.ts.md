---
source: src/modules/delivery/model.ts
sha256: b20453cea8e53354138d631b156ae8ba76357d192b6c51ffd267919e3439db4a
generated_at: 2026-11-14T19:41:23.498205+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/model.ts

## Purpose

Defines the two Mongoose schemas and compiled models for the delivery module: **FulfillmentOrder** (a group of an order's lines that should leave together, created when the order is paid) and **Shipment** (what actually left, with one tracking code). Both are keyed by a unique `{ orderId, number }` pair. The file also declares the TypeScript document interfaces, embedded sub-schemas, indexes, and serialization transforms consumed by the repository and service layers.

## Key elements

- **`FulfillmentOrderDocument` / `ShipmentDocument`** – TypeScript interfaces describing the full shape of each record (status, lines, hold/loss fields, dates, revision, etc.).
- **`FulfillmentOrderLine`** – type alias re-exporting `FulfillmentLine` from `./domain`.
- **`fulfillmentLineSchema`** – embedded sub-schema; tracks `shippedQuantity` and `canceledQuantity` per line.
- **`destinationSchema`** – embedded sub-schema built from `postalAddressPaths`; stored encrypted per shipment.
- **`shipmentLineSchema`** – embedded sub-schema for what physically left (productId, title, quantity).
- **`fulfillmentOrderSchema`** – top-level schema with five indexes (unique `{orderId, number}`, status+hold+productId, status+hold+expectedAt, sparse `sourceShipmentId`, expectedAt, productId).
- **`shipmentSchema`** – top-level schema with two indexes (unique `{orderId, number}`, `fulfillmentOrderId`).
- **`fulfillmentOrderModel` / `shipmentModel`** – compiled Mongoose models registered as `'FulfillmentOrder'` and `'Shipment'`.
- **`applyFulfillmentOrderTransform` / `applyShipmentTransform`** – serialization normalizers (rename `_id`→`id`, drop `__v`) produced via `applySerialization`.
- **`FulfillmentOrderModel` / `ShipmentModel`** – typed `Model<…>` aliases for use in repositories.

## Relationships

- **`postal-address-paths.ts`** – provides `postalAddressPaths`, the field map used to build `destinationSchema`.
- **`serialize.ts`** – provides `applySerialization`, used to derive the two `apply*Transform` functions.
- **`./domain` (fulfillment.ts, index.ts)** – source of the `FulfillmentLine` type (aliased as `FulfillmentOrderLine`) and the `WaitCause` union used in `cause`.
- **`./services/*`** (act, actions, announce, board, cut, deliver, found) – import the models/documents to apply business rules (cutting shipments, announcing holds, finding lost-parcel obligations, etc.).
- **`scenarios/flows/backdate.ts`** – test scenario that exercises backdate logic against these schemas.

## Notes

- **Optimistic concurrency:** `FulfillmentOrderDocument.revision` is incremented on every write; a shipment or cancel "claims" the order by matching the revision value, preventing two racers from landing on the same remainder.
- **Hold vs. loss messaging:** `holdNote`/`lostNote` are staff-internal and are "reaped" (scrubbed) over time; `holdMessage`/`lostMessage` are buyer-facing, mailed, and never reaped. A release drops the message along with the hold.
- **`defaulted` flag:** when `true`, the promise came from the 30-day regulatory default, not a catalogue date. A later catalogue change does not retroactively update the order.
- **`sourceShipmentId` (sparse index):** links a fulfillment order back to the lost shipment whose units it still owes. When the parcel turns up, the `found` service uses this to locate and close every outstanding order.
- **`cause` enum is inline** (`['preorder', 'backorder']`) rather than imported from `@types`, unlike most other status enums in the file.
- **`destination` is encrypted** per-shipment under the shipment's own `_id` and is wiped when the parent order's address is redacted.
