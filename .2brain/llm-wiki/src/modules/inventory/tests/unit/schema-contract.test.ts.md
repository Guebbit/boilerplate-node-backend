---
source: src/modules/inventory/tests/unit/schema-contract.test.ts
sha256: 8576b982fcce55ac0b7454ab5b63b16b9d2890fbf356b2962b3c1a77b15f38ea
generated_at: 2026-10-29T04:09:19.594942+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/unit/schema-contract.test.ts

## Purpose

Asserts that the inventory Mongoose schemas (`stockMovementSchema`, `reservationSchema`) encode the correct database-level contracts—required fields, enum values, defaults, type references, and indexes. These guarantees are enforced by the database rather than any code path, so weakening them causes no runtime failure; this test is the only thing that would catch a silent loss.

## Key elements

- **`describe('stockMovementSchema — the ledger')`** — verifies required paths (`productId`, `reason`), the nine-enum of `MOVEMENT_REASONS` (spelled out literally to catch reordering), `productId` type/ref, zero-defaults on both deltas, timestamps, and the two newest-first indexes.
- **`describe('reservationSchema — the hold')`** — verifies the unique `orderId` index (exactly-once gate), required paths, the four-value `status` enum with `held` default, `items` sub-schema constraints (`min: 1` quantity, `_id: false`), the three indexes (sweep, allocation, unique), and the **absence** of any TTL index.
- **Schema-inspection helpers** (`requiredPaths`, `enumOf`, `defaultOf`, `typeOf`, `refOf`, `optionsOf`, `indexSpecs`, `indexOptionSpecs`, `subSchema`, `pathOptions`, `indexBehaviour`) — imported from the shared test utility to read schema metadata without instantiating documents.

## Relationships

- **`src/modules/inventory/model.ts`** — source of `stockMovementSchema`, `reservationSchema`, and `MOVEMENT_REASONS`; the sole subject under test.
- **`src/types/index.ts`** — provides `StockMovementReason` (generated from OpenAPI), used to cross-check that the schema's `reason` enum matches the generated type.
- **`tests/support/schema.ts`** — supplies all schema-inspection utilities; this file is a primary consumer of that helper API.

## Notes

- The `MOVEMENT_REASONS` test spells out all nine values as string literals rather than comparing against the enum constant, because both sides would be the same expression and the assertion could never fail.
- Index specs are compared as exact strings including direction (e.g. `createdAt-1`), so a flip to ascending would be caught.
- The TTL-index test iterates `Object.values(indexBehaviour(reservationSchema))` and asserts `expireAfterSeconds` is absent on every index—a negative guard against a "convenient" fix that would silently delete reservations and leak stock.
- All tests are pure schema-introspection (no DB connection, no document instantiation); they run as plain unit tests with no external fixtures.
