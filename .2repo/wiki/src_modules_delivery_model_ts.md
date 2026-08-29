# src/modules/delivery/model.ts

## Purpose

Defines the Mongoose schema, document interface, and registered model for the **Shipment** entity. A shipment is the courier-facing record created when an order transitions to `shipped`; it exists to hold tracking-code and delivery-timestamp facts that have no natural home on the Order document. The file is purely declarative — no queries, no business logic.

## Key elements

- **`ShipmentDocument`** – Mongoose `Document` interface: `orderId` (ref to Order), `trackingCode`, `status` (`ShipmentStatus`), `deliveredAt?`, plus auto `createdAt`/`updatedAt`.
- **`ShipmentModel`** – Convenience type alias (`Model<ShipmentDocument>`) for typing repository/service signatures.
- **`shipmentSchema`** – The `Schema<ShipmentDocument>` instance. `orderId` is `unique: true` (enforces one shipment per order at the DB level). `status` is an enum over `ShipmentStatus` values, defaulting to `shipped`. `timestamps: true` is enabled.
- **`applyShipmentTransform`** – A Mongoose `.transform` function built via `applySerialization(shipmentSchema)`. Renames `_id` → `id` and strips `__v` on lean-read output.
- **`shipmentModel`** – The registered Mongoose model (`model('Shipment', shipmentSchema)`). This is the object repositories and services actually use for DB operations.

## Relationships

- **`src/types/index.ts`** – Exports `ShipmentStatus`, the enum consumed here for the `status` field's `enum` constraint and default value.
- **`src/infrastructure/persistence/serialize.ts`** – Provides `applySerialization`, the factory used to derive `applyShipmentTransform`.
- **`src/modules/delivery/repository.ts`** – Sibling that imports `shipmentModel`, `shipmentSchema`, and `applyShipmentTransform` to perform all DB reads/writes for this module.
- **`src/modules/delivery/service.ts`** – Sibling that holds the business rules (status transitions, validation) and delegates persistence to the repository.

## Notes

- `trackingCode` is explicitly a placeholder ("fake here, but shaped like the real thing") — no integration with a real courier API yet.
- The one-to-one invariant with Order is enforced **only** by the `unique` index on `orderId`; there is no application-level guard in this file.
- `deliveredAt` is optional by design — it is `undefined` until a delivery event actually occurs.
- The file's own doc comment routes readers: *queries* → `./repository`, *rules* → `./service`. This file is the single source of schema truth.
