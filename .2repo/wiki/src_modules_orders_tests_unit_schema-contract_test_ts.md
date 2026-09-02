# src/modules/orders/tests/unit/schema-contract.test.ts

## Purpose

Asserts the **declarations** of `orderSchema` — required paths, types, defaults, enums, embedded-subschema options, index specs, and schema-level options — by inspecting the Mongoose schema object directly. This catches declaration defects (a dropped `required`, a flipped `_id: false`, a reversed index direction) that would not change what a valid document looks like and are therefore invisible to integration tests that only drive real saves.

## Key elements

- **`describe('orderSchema — what an order must carry')`** — asserts `requiredPaths` is exactly `['email']`; `userId` is typed `ObjectId`; `notes`, `shippingMethod`, `deletedAt` are *not* required.
- **`describe('orderSchema — status')`** — asserts the enum equals `Object.values(OrderStatus)` and the default is `OrderStatus.pending`.
- **`describe('orderSchema — money')`** — asserts `shippingCost` has no default and `min` is 0.
- **`describe('orderSchema — the embedded snapshots')`** — asserts `items` sub-schema has `_id: false`, requires `quantity`, sets `excludeIndexes: true` on `product`, and that `shippingAddress` has `_id: false` with five required fields (phone optional).
- **`describe('orderSchema — indexes')`** — asserts exactly four named, directed index specs and their options (only `orders_anonymizeAfter` is sparse; none are unique).
- **`describe('orderSchema — options')`** — asserts `timestamps: true`.

## Relationships

- **`src/modules/orders/model.ts`** — source of `orderSchema`, the system under test.
- **`src/types/index.ts`** — provides `OrderStatus` used in enum and default assertions.
- **`tests/support/schema.ts`** — provides the inspection helpers (`requiredPaths`, `typeOf`, `defaultOf`, `enumOf`, `pathOptions`, `optionsOf`, `subSchema`, `indexSpecs`, `indexOptionSpecs`) that read the schema object without a database connection.

## Notes

- `userId` is intentionally **not** in the required set: account erasure unsets it, so the schema cannot claim it is always present.
- Index names are asserted explicitly (not derived) because Mongoose identifies indexes by name — a silent rename would leave the old index in production.
- The `excludeIndexes` check exists because Mongoose copies an embedded schema's indexes onto the parent collection; without it, catalogue-search indexes would be maintained on every order write.
- The test runs with **no database**; all helpers from `tests/support/schema.ts` read the in-memory schema definition.
