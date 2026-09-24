---
source: src/modules/delivery/model.ts
sha256: 781466cb2c56ebda15f89d14389c934be396793c05296d5a100023bf31eb9e96
generated_at: 2026-09-23T18:36:28.152692+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/model.ts

## Purpose

Defines the Mongoose schema and compiled model for the **Shipment** collection — one document per order, enforced by a `unique` index on `orderId`. It captures carrier-specific facts (tracking code, delivered timestamp) that the Order model does not carry, and provides the serialization transform used when the repository returns lean reads.

## Key elements

- **`ShipmentDocument`** – TypeScript interface extending `Document`; declares `orderId` (ObjectId → Order), `trackingCode?`, `status`, `deliveredAt?`, and Mongoose timestamps.
- **`ShipmentModel`** – `Model<ShipmentDocument>` type alias; consumed by `repository.ts` and `service.ts`.
- **`shipmentSchema`** – Mongoose `Schema` with `orderId` (unique, `ref: 'Order'`), `trackingCode` (optional string), `status` (enum from `ShipmentStatus`, default `shipped`), `deliveredAt` (optional Date). `timestamps: true` is enabled.
- **`applyShipmentTransform`** – Wraps `applySerialization(shipmentSchema)` (from `@infrastructure/persistence/serialize`) to rename `_id` → `id` and strip `__v` on serialized output.
- **`shipmentModel`** – The compiled Mongoose model, registered under the name `'Shipment'`.

## Relationships

- **`src/types/index.ts`** – Provides the `ShipmentStatus` enum used as the `status` field's `enum` values and default.
- **`src/infrastructure/persistence/serialize.ts`** – Exports `applySerialization`, which this file calls to build `applyShipmentTransform`.
- **`src/modules/delivery/repository.ts`** – Imports `shipmentModel` / `ShipmentModel` for data-access queries (per the file's own comment: "Queries live in `./repository`").
- **`src/modules/delivery/service.ts`** – Imports the model for business-rule operations (per comment: "rules in `./service`").
- **`src/modules/delivery/index.ts`** – Module barrel; re-exports the model's public surface.
- **`src/modules/delivery/tests/unit/schema-contract.test.ts`** – Asserts the shape of `shipmentSchema` against the `ShipmentDocument` interface.
- **`scenarios/flows/backdate.ts`** – Consumes the model/service in a backdating scenario flow.

## Notes

- `orderId` uniqueness is the **only** mechanism preventing duplicate shipments per order; there is no application-level guard. This mirrors the same discipline applied to the payment model.
- `trackingCode` is intentionally optional — some delivery methods carry no tracking number.
- `status` defaults to `ShipmentStatus.shipped` at insert time; the service layer is responsible for transitioning to subsequent states.
- The serialized form (post `applyShipmentTransform`) exposes `id` instead of `_id` and omits `__v`; any code reading raw documents directly from the model (without going through the repository's lean reads) will see the un-serialized shape.
