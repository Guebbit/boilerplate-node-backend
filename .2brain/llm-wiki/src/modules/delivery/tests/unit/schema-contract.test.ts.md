---
source: src/modules/delivery/tests/unit/schema-contract.test.ts
sha256: 606147328bc1888bee8bf1dec04b91e6a39b1ecb8b54e7267431fc4f9c00768d
generated_at: 2026-11-14T19:55:55.886982+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/unit/schema-contract.test.ts

## Purpose

Unit tests that pin the shape, constraints, and defaults of the two Mongoose schemas in the delivery module (`fulfillmentOrderSchema`, `shipmentSchema`). They exist so that a schema change (a new required field, a renamed index, a widened enum) fails CI immediately instead of surfacing as a runtime surprise, and they encode the intent behind non-obvious choices (e.g. `deliveredAt` has no default because its absence *is* "in transit").

## Key elements

- **`describe('fulfillmentOrderSchema')`** — asserts required paths, the `{orderId, number}` unique compound index, `ObjectId` reference to `Order`, enum closed-ness on `status`, `kind`, and `holdReason` against the `FulfillmentOrderStatus`, `FulfillmentOrderKind`, and `FulfillmentHoldReason` constants, `status` defaulting to `open`, `revision` defaulting to `0`, and `timestamps: true`.
- **`describe('shipmentSchema')`** — asserts required paths (noting `trackingCode`, `destination`, `deliveredAt` are intentionally optional), the same `{orderId, number}` unique index (but *no* unique index on `orderId` alone), `ObjectId` refs to `Order` and `FulfillmentOrder`, `status` defaulting to `shipped`, `forced` defaulting to `false`, `deliveredAt` having no default, `timestamps: true`, and the `destination` sub-schema requiring `city`, `country`, `fullName`, `street`, `zip`.
- **Assertion helpers** (`requiredPaths`, `enumOf`, `defaultOf`, `refOf`, `typeOf`, `indexOptionSpecs`, `optionsOf`, `subSchema`) — imported from `@tests/schema`; they wrap Mongoose schema introspection so tests read as flat `expect(...).toEqual(...)` calls.

## Relationships

- **`src/modules/delivery/model.ts`** — the sole subject under test; the file imports `fulfillmentOrderSchema` and `shipmentSchema` directly from it.
- **`src/types/index.ts`** — supplies the enum constants (`FulfillmentOrderStatus`, `FulfillmentOrderKind`, `FulfillmentHoldReason`, `ShipmentStatus`) that the tests use to verify the schema's `enum` options are exactly closed to the contract's vocabulary.
- **`tests/support/schema.ts`** — provides every assertion helper (`requiredPaths`, `enumOf`, `defaultOf`, `refOf`, `typeOf`, `indexOptionSpecs`, `optionsOf`, `subSchema`), making the tests schema-generic rather than hand-rolled.

## Notes

- The unique index is on the **compound** `{orderId, number}` pair, not on `number` alone; the shipment test explicitly asserts that a bare `orderId_1` unique index does **not** exist, because one order legitimately has many shipments.
- `deliveredAt` is asserted to have `default: undefined` (not omitted) to document the design decision that absence encodes "in transit" rather than being an oversight.
- `trackingCode` and `destination` are deliberately excluded from `requiredPaths`; inline comments in the test explain why (code may arrive post-shipment; pickup has no address).
- The tests use `@tests/schema` (a tsconfig path alias) rather than a relative import, consistent with other schema-contract test files in the repo.
