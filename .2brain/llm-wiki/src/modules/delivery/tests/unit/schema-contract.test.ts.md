---
source: src/modules/delivery/tests/unit/schema-contract.test.ts
source_sha256: a3f8f3ecb193cf8c035b120cc819ee366abd6417c725382471ffa77d0262ab9b
context_sha256: 5fff99669dd31857c78fc5c7412db092d4b790b6d373f1845724dcebc0c2a626
generated_at: 2026-11-22T05:05:52.567563+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/tests/unit/schema-contract.test.ts

## Purpose
Unit tests that pin the contract of the delivery module's two Mongoose schemas, `fulfillmentOrderSchema` and `shipmentSchema`. They assert required paths, unique indexes, `ObjectId` refs, enum vocabularies, defaults and timestamps, so the database enforces exactly-once behavior. A retried listener cannot create a duplicate fulfillment order, and two shipments cannot take the same number.

## Key elements
- **`describe('fulfillmentOrderSchema')`**
  - Required paths are exactly `kind`, `lines`, `number`, `orderId` and `revision`.
  - The index `orderId_1_number_1` is unique.
  - `orderId` is an `ObjectId` that refs `Order`.
  - `status`, `kind` and `holdReason` enums equal the `Object.values` of the matching contract enums.
  - `status` defaults to `open`.
  - `revision` defaults to `0`.
  - Timestamps are enabled.
- **`describe('shipmentSchema')`**
  - Required paths are exactly `forced`, `fulfillmentOrderId`, `kind`, `lines`, `number`, `orderId` and `shippedAt`.
  - `trackingCode`, `destination` and `deliveredAt` are optional.
  - When `destination` is present it requires `city`, `country`, `fullName`, `street` and `zip`. `phone` stays optional.
  - `orderId_1_number_1` is unique, and `orderId_1` is not unique, so an order can have many shipments.
  - `orderId` refs `Order`, and `fulfillmentOrderId` refs `FulfillmentOrder`.
  - `status` matches `ShipmentStatus` and defaults to `shipped`.
  - `forced` defaults to `false`.
  - `deliveredAt` has no default, so its absence means "in transit".
  - Timestamps are enabled.

## Relationships
- `@modules/delivery/model` (`src/modules/delivery/model.ts`): supplies the schemas under test, `fulfillmentOrderSchema` and `shipmentSchema`.
- `@types` (`src/types/index.ts`): supplies the enums `FulfillmentHoldReason`, `FulfillmentOrderKind`, `FulfillmentOrderStatus` and `ShipmentStatus`. The tests compare schema enums and defaults against them.
- `@tests/schema` (`tests/support/schema.ts`): supplies the introspection helpers `requiredPaths`, `indexOptionSpecs`, `typeOf`, `refOf`, `enumOf`, `defaultOf`, `optionsOf` and `subSchema`.

## Notes
- The tests inspect schema definitions only. They never connect to a database or save documents.
- Required-path lists are compared with `toEqual` in alphabetical order, so adding or removing a required field breaks the test.
- Index specs are matched as strings of the form `orderId_1_number_1: unique=true`.
