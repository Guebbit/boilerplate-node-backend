---
source: src/modules/inventory/tests/unit/schema-contract.test.ts
sha256: 6a3a1919508fc115d08abf2d55cb8ba36ea91a7eb6430c474a320550a9288b1f
generated_at: 2026-11-08T06:08:41.502125+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/unit/schema-contract.test.ts

## Purpose

Validates the **database-level contracts** encoded in the inventory schemas — guarantees that live in indexes, defaults, and enum constraints rather than in application code. The tests exist so that weakening any of these (a missing unique index, a removed default, an added enum value) surfaces as a test failure instead of a silent loss of a correctness guarantee that no code path would ever catch.

## Key elements

- **`describe('stockMovementSchema — the ledger')`** — Asserts required paths, the `reason` enum, `productId` type/ref, zero-defaults on both deltas, timestamps, and the exact two `createdAt: -1` indexes.
- **`describe('reservationSchema — the hold')`** — Asserts the unique `orderId` index (exactly-once), required paths, the four-value `status` enum with `'held'` default, the `items` sub-schema (`productId` + `quantity ≥ 1`, no `_id`), the three indexes (sweep, allocation, unique), and the **absence** of any TTL (`expireAfterSeconds`) index.
- **Schema-introspection helpers** (`defaultOf`, `enumOf`, `indexSpecs`, `indexOptionSpecs`, `indexBehaviour`, `optionsOf`, `pathOptions`, `refOf`, `requiredPaths`, `subSchema`, `typeOf`) — imported from `@tests/schema`; these let tests read Mongoose schema metadata without instantiating models.

## Relationships

- **`src/modules/inventory/model.ts`** — Provides `stockMovementSchema` and `reservationSchema`, the two objects under test.
- **`src/types/index.ts`** — Provides the `StockMovementReason` enum; the test asserts the schema's `reason` enum matches `Object.values(StockMovementReason)` to prevent drift between the generated type and the schema.
- **`tests/support/schema.ts`** — Supplies all introspection helpers; without it the tests would need to dig into Mongoose internals directly.

## Notes

- **TTL index is explicitly forbidden.** The test iterates every index's behaviour options and asserts none carry `expireAfterSeconds`. Rationale: a TTL index *deletes* the document, but the reserved units must be returned and the record must survive. Expiry is handled by a sweep job, not by the database dropping the row.
- **Index direction is asserted, not just presence.** Both ledger indexes are `createdAt: -1`; flipping to `+1` would still "work" for correctness but would force an in-memory sort on every read.
- **`min: 1` on `items.quantity`** is load-bearing: a zero-quantity line would be "released" as nothing, leaving the stock counter it was supposed to decrement untouched.
- The file's module doc comment frames the philosophy: these contracts are enforced by the database, so no application code will throw if they break — the guarantee simply stops existing.
