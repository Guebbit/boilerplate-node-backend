# src/modules/delivery/tests/unit/schema-contract.test.ts

## Purpose
Contract tests that pin down the shape, constraints, and options of `shipmentSchema` (the Mongoose schema for a parcel). They exist so that any unintended change to field requirements, index uniqueness, enum values, defaults, or references is caught immediately — without running the full application.

## Key elements
- **`describe('shipmentSchema')`** — single test suite containing six assertions:
  - Required paths are exactly `['orderId', 'trackingCode']`.
  - `orderId` carries a database-level unique index (`orderId_1: unique=true`).
  - `orderId` is typed `ObjectId` and references the `Order` model.
  - `status` is constrained to `Object.values(ShipmentStatus)` and defaults to `ShipmentStatus.shipped`.
  - `deliveredAt` has **no** default (absence means "in transit").
  - `timestamps` option is enabled.
- **Test helpers** (all imported from `@tests/schema`): `requiredPaths`, `indexOptionSpecs`, `typeOf`, `refOf`, `enumOf`, `defaultOf`, `optionsOf`.

## Relationships
- **`src/modules/delivery/model.ts`** — the file under test; `shipmentSchema` is imported and every assertion operates on it.
- **`src/types/index.ts`** — provides the `ShipmentStatus` enum used to assert the allowed values and default of the `status` field.
- **`tests/support/schema.ts`** — supplies the seven schema-inspection helpers that make each assertion a one-liner.

## Notes
- These are **shape-only** assertions (field presence, index options, enum membership). They do not exercise Mongoose runtime behavior such as pre/post hooks or validation callbacks.
- The file-level doc comment encodes the business invariant: one shipment per order, enforced at the DB level to prevent duplicate tracking codes on retried dispatches. The `shipped` default is intentional — there is no "pending parcel" state in the domain.
- `deliveredAt` being `undefined` by default is a deliberate contract, not an oversight; the absence *is* the "in transit" signal.
