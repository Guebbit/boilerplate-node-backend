---
source: src/modules/inventory/repository.ts
source_sha256: ca0f0376265c4412e1d7421cf196a212e0aa7b3ff8374f4b8acbcd3b148c8df6
context_sha256: 9fba6da06d0d0c61ebcbead2bb9570a72c88355f1af1c421dd6b3c526677a052
generated_at: 2026-11-22T05:20:47.346982+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/repository.ts

## Purpose
Defines the repositories for the three collections the inventory module owns: stock levels, stock movements (an append-only ledger), and reservations. It applies conditional Mongo writes to stock counters and keeps `available` in step. The business rules live in `./services`. Every exported type is written out explicitly because Mongoose's generics are too large for TypeScript to serialize an inferred one (TS7056).

## Key elements
- **`conditionFor(reason, quantity, kind)`** (private): maps each `StockMovementReason` to the Mongo filter that must match for the transition to apply.
  - `reserve` requires `available >= quantity`.
  - `ship` requires both `onHand` and `reserved` to cover the quantity.
  - `release` and `expire` check `backordered` for a backorder-kind line, otherwise `reserved`.
  - `backorder` checks the `backorderLimit` cap in the filter. An explicit `null` means no cap; a missing field counts as 0 (closed).
  - `owed` and `receive`/`restock` have no condition.
  - `allocate` requires both `backordered` and `available`.
  - `adjust` must not drop `onHand + quantity` below `reserved`.
- **`StockLevelRow`**: a stock-board row holding this module's counters only, with no product fields.
- **`PreorderLevelRow`**: a preorder-board row with `backorderLimit`, `backordered`, `ordered` (lifetime units claimed), `held` (unpaid) and `paid` (committed).
- **`storedCap`**: restores the stored meaning of a lean-read cap. `undefined` becomes 0 and `null` stays `null`.
- **`toReservationItems`**: converts hold lines to storage shape, turning string ids into `ObjectId`s and defaulting `kind` to `'stock'`.
- **`orderedByProduct`**: aggregates the ledger's `backorder` rows into lifetime preorder units per product.
- **`outstandingByProduct`**: aggregates open reservations' backorder-kind items into `held` and `paid` totals per product.
- **`stockLevelRepository`**: `createRepository` base plus these extra methods:
  - `insertIfAbsent`: upserts a zeroed row and returns whether this call created it.
  - `findManyByProductIds`, `findByProductId`, `deleteByProductId`.
  - `applyDelta`: applies a counter delta guarded by the transition's condition.
  - `setBackorderLimit`.
  - `preorderBoard` and `stockBoard`: paginated board reads.
  - `lowAvailabilityProductIds` and `sumReserved`.

The visible content ends partway through `stockLevelRepository`. The stock-movement and reservation repositories are not shown here.

## Relationships
- **`./model`**: supplies the Mongoose models, the transform appliers, the document types, `ReservationStatus` and `OPEN_RESERVATION_STATUSES`.
- **`@infrastructure/persistence/create-repository`**: supplies `createRepository`, `toObjectId`, and the `Repository`, `AppendOnlyLedger`, `Lean` and `Wire` types.
- **`@infrastructure/persistence/conditional-status`**: `updateStatusIfIn` is imported as `conditionalStatus`.
- **`@infrastructure/persistence/mongo-errors`**: supplies `isDuplicateKey`.
- **`./domain`**: supplies `withAdded`, `CounterDelta` and `HoldKind`. `conditionFor` is meant to stay in step with `counterDeltaFor`'s reason-to-deltas table there.
- **`src/modules/inventory/services/admin.ts`, `presenter.ts` and `metrics.ts`**: listed as graph neighbors, but their interactions are not visible in the shown content.
- **Integration and unit tests** in the cart and delivery modules are also neighbors, but the shown content does not say how they use this file.

## Notes
- `QueryFilter` is deliberately a repository-only import. A service can ask this module to move counters but cannot hand it a raw Mongo condition.
- The match between `conditionFor` and `counterDeltaFor` is kept by hand. `src/modules/inventory/tests/unit/transitions.test.ts` covers `counterDeltaFor` only, not `conditionFor`.
- The `backorder` guard uses `$type: 'null'` rather than `{ backorderLimit: null }`, because the latter would also match an absent field. An absent field means closed.
- `insertIfAbsent` is race-safe through `productId`'s unique index with `$setOnInsert`. Its boolean result lets a redelivered `PRODUCT_CREATED` book opening stock only once.
- `orderedByProduct` counts every claim, including ones since given back. `backordered` is the count still owed.
