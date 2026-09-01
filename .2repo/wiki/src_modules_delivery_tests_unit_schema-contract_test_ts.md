# src/modules/delivery/tests/unit/schema-contract.test.ts

## Purpose

Contract test that pins the Mongoose `shipmentSchema` to its intended shape: required fields, the exactly-once unique index on `orderId`, the ObjectId reference to `Order`, the `ShipmentStatus` enum with its default, the absence of a default on `deliveredAt`, and the `timestamps` option. It exists so that any future schema change that breaks the one-parcel-per-order guarantee or the status lifecycle is caught in unit tests rather than in production dispatch.

## Key elements

- **`describe('shipmentSchema')`** — single test suite; all assertions target the exported `shipmentSchema`.
- **Required-paths check** — asserts `['orderId', 'trackingCode']` are the only required fields; `deliveredAt` is intentionally optional (absence = in transit).
- **Unique-index check** — asserts the index spec `orderId_1: unique=true` is present, the database-level exactly-once constraint.
- **ObjectId / ref check** — asserts `orderId` is typed `ObjectId` and references the `Order` model.
- **Status enum & default check** — asserts the enum matches `Object.values(ShipmentStatus)` and the default is `ShipmentStatus.shipped`.
- **`deliveredAt` default check** — asserts `defaultOf` returns `undefined` (no default is set).
- **Timestamps check** — asserts the schema-level `timestamps` option is `true`.

## Relationships

- **`src/modules/delivery/model.ts`** — the file under test; exports `shipmentSchema`.
- **`src/types/index.ts`** — supplies the `ShipmentStatus` enum used in the status/default assertions.
- **`tests/support/schema.ts`** — provides the schema-introspection utilities (`requiredPaths`, `indexOptionSpecs`, `typeOf`, `refOf`, `enumOf`, `defaultOf`, `optionsOf`) that let tests assert on Mongoose schema internals without instantiating the model.

## Notes

- The file's module-level JSDoc and inline comments encode domain intent (exactly-once dispatch, no "pending" parcel state, absence of `deliveredAt` *is* the "in transit" signal). If you change the schema, update those comments alongside the test assertions.
- Assertions use the shared `@tests/schema` helpers rather than raw Mongoose introspection; keep new schema-contract tests in this file and use the same helper set for consistency across the codebase.
