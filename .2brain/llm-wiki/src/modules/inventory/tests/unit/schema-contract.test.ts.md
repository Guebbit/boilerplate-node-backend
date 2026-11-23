---
source: src/modules/inventory/tests/unit/schema-contract.test.ts
source_sha256: 9aecc80c9f438d2dbb62de66d19c50c5ae5d5e6a07ffccea944f290b452b2903
context_sha256: 0b7b694f8f000ffc17799c2ec228bd1c41e1c30c0ca226cf2e2f04a16880c633
generated_at: 2026-11-22T05:28:47.950258+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/tests/unit/schema-contract.test.ts

## Purpose
Unit tests that pin the contracts of the inventory module's two Mongoose schemas: the stock ledger (`stockMovementSchema`) and the reservation hold (`reservationSchema`). The rules asserted here are enforced by the database (unique indexes, defaults, required paths), not by any code path. If one is weakened, nothing else fails, and the guarantee silently disappears. These tests are the only guard.

## Key elements
- **`describe('stockMovementSchema — the ledger')`** asserts:
  - Only `productId` and `reason` are required.
  - `reason` enum equals `Object.values(StockMovementReason)`, so no fourth copy of the list exists.
  - `productId` is an `ObjectId` with `ref: 'Product'`.
  - `onHandDelta` and `reservedDelta` both default to `0`, so a sum over rows reproduces the counters.
  - `timestamps` is enabled.
  - Exactly two indexes exist, both `createdAt: -1`: `stockmovements_createdAt` and `stockmovements_productId_createdAt`.
- **`describe('reservationSchema — the hold')`** asserts:
  - `orderId` has a unique index (`orderId_1: unique=true`), which makes reserving exactly-once.
  - Required paths are `expiresAt`, `items`, `orderId` and `status`.
  - `status` enum is `held`, `committed`, `shipped`, `released`, and defaults to `held`.
  - The `items` sub-schema requires `productId` and `quantity`, has `quantity.min === 1`, and has `_id: false`.
  - Exactly three indexes exist: `orderId_1`, `reservations_status_expiresAt` (for the expiry sweep), and `reservations_status_itemsProductId_committedAt` (for the preorder allocation queue).
  - No index has `expireAfterSeconds`. Expiry is deliberately a sweep, because a TTL index would delete documents and leak stock.

## Relationships
- **`src/modules/inventory/model.ts`**: supplies `stockMovementSchema` and `reservationSchema`, the objects under test.
- **`src/types/index.ts`** (imported as `@types`): supplies the generated `StockMovementReason` enum, used as the expected source of truth for the ledger's `reason` values.
- **`tests/support/schema.ts`** (imported as `@tests/schema`): provides the schema-introspection helpers used throughout: `defaultOf`, `enumOf`, `indexBehaviour`, `indexOptionSpecs`, `indexSpecs`, `optionsOf`, `pathOptions`, `refOf`, `requiredPaths`, `subSchema` and `typeOf`.

## Notes
- The tests inspect the schema definitions only. They do not exercise a database or any operation code.
- Index assertions compare full ordered lists, so adding, removing or reordering an index (or flipping a direction) fails the test. This is intentional: a `+1` on the ledger's `createdAt` would force in-memory sorting.
- Index specs are compared as formatted strings, such as `'orderId_1: orderId+1'` and `'productId+1, createdAt-1'`. The format comes from the helpers in `tests/support/schema.ts`.
- Changing the allowed `status` values here means every lifecycle operation must handle the new state. `shipped` and `released` are terminal, and `committed` can still move to `released`.
