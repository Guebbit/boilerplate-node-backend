# src/modules/delivery/model.ts

## Purpose

Defines the Mongoose schema, document interface, and compiled model for the **Shipment** entity — the per-order record that stores courier-specific facts (`trackingCode`, `deliveredAt`) the Order document has no field for. Enforces one-shipment-per-order via a `unique` index on `orderId`.

## Key elements

- **`ShipmentDocument`** – Interface extending Mongoose `Document`; declares `orderId`, `trackingCode`, `status`, optional `deliveredAt`, and the standard timestamp fields.
- **`ShipmentModel`** – Type alias (`Model<ShipmentDocument>`) used as the second generic parameter when compiling the model.
- **`shipmentSchema`** – Mongoose `Schema` instance. `orderId` is a required, unique `ObjectId` referencing `Order`; `status` is an enum constrained to `ShipmentStatus` values with default `ShipmentStatus.shipped`; `timestamps: true` enables `createdAt`/`updatedAt`.
- **`applyShipmentTransform`** – Serialization helper built from `applySerialization(shipmentSchema)`. Normalizes lean-query output: renames `_id` → `id` and strips `__v`.
- **`shipmentModel`** – The compiled Mongoose model registered under the name `'Shipment'`.

## Relationships

- **`src/types/index.ts`** – Imports the `ShipmentStatus` enum used to constrain the `status` field and set its default.
- **`src/infrastructure/persistence/serialize.ts`** – Imports `applySerialization`, which is applied to `shipmentSchema` to produce `applyShipmentTransform`.
- **`src/modules/delivery/repository.ts`** – Consumes `shipmentModel` and `applyShipmentTransform` for data access (queries live here per the file's own comment).
- **`src/modules/delivery/service.ts`** – Upstream of the repository; the domain rules layer that the model feeds into.
- **`src/modules/delivery/tests/unit/schema-contract.test.ts`** – Unit-tests the shape and invariants of `shipmentSchema`.

## Notes

- `orderId` is both `required` and `unique`, making it effectively a secondary key alongside `_id`. Any insert or update that changes `orderId` must respect that uniqueness.
- The `ref: 'Order'` is a Mongoose-only hint (no FK enforced at the DB level); there is no automatic populate unless the repository explicitly calls it.
- `applyShipmentTransform` is intended for **lean** reads from the repository factory — applying it to full `Document` instances would be redundant.
- The tracking code is noted in a comment as "fake here, but shaped like the real thing," meaning its format is not validated beyond `required: true`.
