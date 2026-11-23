---
source: src/modules/inventory/tests/unit/transitions.test.ts
source_sha256: 5f0177e1fb8746ea64a7ed96ab6723d94b613920e944556ca47871cdc8e24dd6
context_sha256: ecd356d1c93b87750e5c8b926635aac7afff4485c238b5898ed9377951456d79
generated_at: 2026-11-22T05:29:05.879677+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/tests/unit/transitions.test.ts

## Purpose
Unit tests for `counterDeltaFor`, the inventory transition table that maps a stock movement reason and quantity to signed changes on three counters (`onHandDelta`, `reservedDelta`, `backorderedDelta`). The tests are pure, with no mocks or database. They assert business invariants rather than restating the table, so a wrongly copied table would still fail.

## Key elements
- `EVERY_REASON`: `Object.values(StockMovementReason)`, used so newly added reasons are exercised without editing the cases.
- `covers every reason the contract declares`: calls `counterDeltaFor` with every reason and checks the result has numeric `onHandDelta`, `reservedDelta` and `backorderedDelta`. This forces the exhaustive switch to be hit for each reason.
- Signed-delta table (`it.each`): pins the exact deltas for quantity 3.
  - `reserve`: reserved +3.
  - `ship`: onHand -3 and reserved -3.
  - `release` and `expire`: reserved -3.
  - `receive`, `adjust` and `restock`: onHand +3.
  - `backorder` and `owed`: backordered +3.
  - `allocate`: reserved +3 and backordered -3.
  - The test comments describe this as `openapi.yaml`'s signed table.
- Invariant tests:
  - Only `ship`, `receive`, `adjust` and `restock` change `onHandDelta`.
  - `ship` moves onHand and reserved equally, so availability (`onHand - reserved`) is unchanged.
  - `release` and `expire` exactly cancel a `reserve`.
  - `reserve`, `release` and `expire` never touch onHand.
- `adjust` sign test: the quantity's sign is carried through (-3 gives onHand -3), which guards against an `Math.abs`.
- Preorder claim test: `release` and `expire` called with a third argument `'backorder'` give `backorderedDelta: -4` and leave onHand and reserved untouched. This cancels a `backorder` claim.
- `allocate` test: reserved rises by exactly what backordered falls by, and onHand is unchanged.

## Relationships
- `src/modules/inventory/domain/index.ts`: the import path for `counterDeltaFor`.
- `src/modules/inventory/domain/transitions.ts`: presumably where `counterDeltaFor` is implemented, behind the domain index. The test never imports it directly.
- `src/types/index.ts`: supplies `StockMovementReason` through the `@types` alias. Its values drive `EVERY_REASON` and the table cases.

## Notes
- `adjust` is the only reason whose quantity arrives already signed. The other reasons take a positive quantity and the table applies the sign.
- `release` and `expire` take an optional third argument (`'backorder'`). It switches them from undoing a reserve to undoing a backorder claim.
- The tests use `toSorted()` for order-independent comparison of reason lists.
