---
source: src/modules/inventory/tests/integration/multi-line-race.test.ts
source_sha256: 8325fdb5bcfc49915ceb69a1f2bb2da41bdcbd9d3e05e0c5fa95e15449bd943d
context_sha256: 8b79cf3f626fe69c3c90521b4c469b51f4b47e197631a354b25f2bec5ba61f62
generated_at: 2026-11-22T05:27:02.658533+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/tests/integration/multi-line-race.test.ts

## Purpose
Integration test for a race between two multi-line holds on the same two products, listed in opposite order. It checks that `reserveForOrder` (which takes lines in canonical, product-id-sorted order) lets exactly one order succeed instead of both being refused. The interleaving is forced deterministically with a barrier rather than relying on scheduler timing.

## Key elements
- `holdLaterReservesUntilFirstWritesLand(firstWrites)`: spies on `stockLevelRepository.applyDelta`. Only `StockMovementReason.reserve` writes are intercepted; other reasons go straight to the real implementation. Writes after the first `firstWrites` wait on a promise that resolves once all the first writes have settled. A write is counted as settled via `.finally`, so a rejected write (e.g. a transaction write conflict and retry) still opens the barrier.
- `afterEach(jest.restoreAllMocks)`: removes the spy between tests.
- The single test creates two products (`onHand: 5` each). It runs two `reserveForOrder` calls concurrently, with order `'a'…` taking left then right and order `'b'…` taking right then left, 3 units per line. The barrier is set with `firstWrites = 2`.
- Assertions:
  - exactly one outcome has `held`;
  - `reservationModel` has `held` count equal to the number standing and `released` count equal to the rest (the loser's hold is kept as `released`, never deleted);
  - for each product, `reserved == standing * 3` and `available == 5 - standing * 3`.

## Relationships
- `tests/support/setup-test-db.ts`: `setupTestDb()` provides the test database.
- `src/modules/products/tests/factories.ts`: `createProduct` seeds the products with stock.
- `src/modules/inventory/services/index.ts`: exports `inventoryService`, whose `reserveForOrder` is the code under test.
- `src/modules/inventory/repository.ts`: exports `stockLevelRepository`; its `applyDelta` is spied on to build the barrier, and `findByProductId` reads back the final levels.
- `src/modules/inventory/model.ts`: exports `reservationModel`, used to count holds by status.
- `src/types/index.ts`: provides `StockMovementReason`, used to identify reserve writes.

## Notes
- The spy is installed on an own method of a plain object, so `jest.spyOn` is safe under the swc mutation harness.
- The barrier count must match the number of "first" reserve writes. With two orders taking one line each first, that is 2. The later writes are held until both have landed.
- The test passes only if the service takes lines in canonical order. Taken in the order given, each order would take its first line before either took its second, and both would be refused despite the units existing.
