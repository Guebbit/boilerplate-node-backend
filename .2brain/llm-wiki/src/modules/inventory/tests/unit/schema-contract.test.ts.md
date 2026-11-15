---
source: src/modules/inventory/tests/unit/schema-contract.test.ts
sha256: 47eae68963a443ff2321dcda03b560d90043ed53f51dc75360cc209be1ffb712
generated_at: 2026-11-14T20:10:45.302639+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/unit/schema-contract.test.ts

## Purpose

Contract tests for the two inventory Mongoose schemas (`stockMovementSchema` and `reservationSchema`). They pin down database-level invariants—defaults, required fields, enum values, index definitions—that no application code path enforces. Weakening any of these wouldn't crash a request; the guarantee would simply stop existing silently. The tests exist so that "silently" becomes "this test fails."

## Key elements

- **`describe('stockMovementSchema — the ledger')`** — Six assertions:
  - Required paths are exactly `['productId', 'reason']`.
  - `reason` enum matches `Object.values(StockMovementReason)` (avoids a fourth hardcoded copy).
  - `productId` is an `ObjectId` referencing `Product`.
  - `onHandDelta` and `reservedDelta` both default to `0` (replayability: `$sum` over rows must reproduce the counter).
  - `timestamps: true`.
  - Index specs are exactly two, both ending `createdAt-1`.

- **`describe('reservationSchema — the hold')`** — Six assertions:
  - `orderId` has a `unique` index (the exactly-once insertion gate).
  - Required paths are `['expiresAt', 'items', 'orderId', 'status']`.
  - `status` enum is `['held', 'committed', 'shipped', 'released']`; defaults to `'held'`.
  - `items` sub-schema requires `productId` + `quantity` (min 1), and disables `_id`.
  - Index specs are exactly three (unique orderId, sweep query, allocation queue).
  - No index carries `expireAfterSeconds` (TTL would delete documents and leak stock).

- **Schema-inspection helpers** (all from `@tests/schema`): `defaultOf`, `enumOf`, `indexBehaviour`, `indexOptionSpecs`, `indexSpecs`, `optionsOf`, `pathOptions`, `refOf`, `requiredPaths`, `subSchema`, `typeOf`.

## Relationships

- **`src/modules/inventory/model.ts`** — source of the two schemas under test (`stockMovementSchema`, `reservationSchema`).
- **`src/types/index.ts`** — source of the `StockMovementReason` enum used in the reason-enum assertion.
- **`tests/support/schema.ts`** — provides every inspection helper; the test's entire vocabulary for reading a compiled Mongoose schema without instantiating it.

## Notes

- Index assertions use `toEqual` on the full array, so adding *or* removing an index breaks the test even if existing indexes are unchanged.
- The "no TTL index" check iterates `Object.values(indexBehaviour(...))` and asserts none has `expireAfterSeconds`. This is a deliberate guard against a well-intentioned "cleanup" index that would silently delete holds and strand reserved stock.
- The zero-default assertion on deltas is not a style preference: an `undefined` delta is not zero to MongoDB's `$sum`, so omitting the default breaks replayability at the database level with no code-path failure.
