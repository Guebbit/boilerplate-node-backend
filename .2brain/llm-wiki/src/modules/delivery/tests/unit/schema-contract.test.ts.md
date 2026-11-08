---
source: src/modules/delivery/tests/unit/schema-contract.test.ts
sha256: d9e2c4045ea531b90c9d8bc5e8b8056255d32f6036046d71d16cae6323e34fc2
generated_at: 2026-11-08T05:47:24.827163+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/unit/schema-contract.test.ts

## Purpose

Locks down the Mongoose schema contract for `fulfillmentOrderSchema` and `shipmentSchema`: required fields, enum vocabularies, default values, ObjectId references, timestamp options, and the shared `{ orderId, number }` unique index that enforces exactly-once semantics at the database level. Exists so that schema drift (a missing field, a widened enum, a lost unique index) is caught in CI before it reaches production.

## Key elements

- **`describe('fulfillmentOrderSchema')`** — asserts required paths (`kind`, `lines`, `number`, `orderId`, `revision`), the `orderId_1_number_1` unique index, `orderId` as `ObjectId` ref → `Order`, enum alignment with `FulfillmentOrderStatus` / `FulfillmentOrderKind` / `FulfillmentHoldReason`, `status` default = `open`, `revision` default = `0`, and `timestamps: true`.
- **`describe('shipmentSchema')`** — asserts required paths (`forced`, `fulfillmentOrderId`, `kind`, `lines`, `number`, `orderId`, `shippedAt`), the same `orderId_1_number_1` unique index (but no per-order uniqueness), `orderId` ref → `Order` and `fulfillmentOrderId` ref → `FulfillmentOrder`, `status` enum = `ShipmentStatus` with default `shipped`, `forced` default `false`, `deliveredAt` default `undefined`, and `timestamps: true`.
- **Helper usage** (`requiredPaths`, `indexOptionSpecs`, `refOf`, `enumOf`, `defaultOf`, `optionsOf`, `typeOf`) — thin assertion helpers imported from `@tests/schema` that extract and compare Mongoose schema metadata without running a database.

## Relationships

- **`src/modules/delivery/model.ts`** — source of the two schemas under test (`fulfillmentOrderSchema`, `shipmentSchema`). Any change to field names, defaults, enums, or index definitions here will break these assertions.
- **`src/types/index.ts`** — provides the enum constants (`FulfillmentOrderStatus`, `FulfillmentOrderKind`, `FulfillmentHoldReason`, `ShipmentStatus`) that the tests compare against to verify the schema's vocabulary is closed to the contract.
- **`tests/support/schema.ts`** — supplies all schema-introspection helpers. Changing a helper's extraction logic (e.g., how `indexOptionSpecs` serializes an index spec) can alter the string format these tests assert on.

## Notes

- The unique index string is asserted as a literal (`'orderId_1_number_1: unique=true'`). If Mongoose or the helper changes its serialization format, both assertions break — keep the format stable in `tests/support/schema.ts`.
- `deliveredAt` intentionally has **no** default; its absence is the "in transit" state. Do not add a default to make the field "optional by value."
- `trackingCode` and `destination` are optional by design (post-dispatch code, pickup with no address). Their absence from `requiredPaths` is the contract, not an oversight.
- `shipmentSchema` default `status` is `shipped`, not a "pending" state — a shipment row only exists after dispatch.
- The module-level JSDoc documents the cross-module invariant: the `{ orderId, number }` unique constraint mirrors the payment schema's exactly-once guarantee.
