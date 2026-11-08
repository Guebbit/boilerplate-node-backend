---
source: src/modules/inventory/tests/integration/multi-line-race.test.ts
sha256: b64381afc861a4c23d961fabf45804fc499b250374b8b8e2a8d82db221635d6f
generated_at: 2026-11-08T06:06:19.929086+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/integration/multi-line-race.test.ts

## Purpose

Integration test verifying that when two multi-line `reserveForOrder` calls race for the same two products listed in **opposite** order, exactly one hold stands (never both, never neither), the stock level reflects only the standing hold, and a refused hold leaves zero residual state. The dangerous interleaving—each order grabs its first line before either grabs the second—is forced deterministically via a write barrier.

## Key elements

- **`holdLaterReservesUntilFirstWritesLand(firstWrites)`** — Spies on `stockLevelRepository.applyDelta`. Lets the first `firstWrites` reserve-writes complete, then gates all subsequent reserve-writes behind a promise barrier. Non-reserve writes pass through untouched. Returns no value; the spy is restored by `afterEach`.
- **`describe('opposite-order multi-line holds…')` / `it('lets exactly one stand…')`** — Creates two products (5 units each), sets the barrier to 2, fires two `reserveForOrder` calls in `Promise.all` with product order swapped, then asserts:
  - `standing === 1`
  - `reservationModel` document count (held and total) equals `standing`
  - Per-product `reserved === standing * 3` and `available === 5 - standing * 3`

## Relationships

- **`tests/support/setup-test-db.ts`** — Called once at module top level (`setupTestDb()`) to configure the test database connection.
- **`src/modules/products/tests/factories.ts`** — Provides `createProduct` to seed two inventory-bearing products with known `onHand` counts.
- **`src/types/index.ts`** — Supplies `StockMovementReason.reserve`, used to distinguish reserve writes inside the barrier spy.
- **`src/modules/inventory/services/index.ts`** — Source of `inventoryService.reserveForOrder`, the system under test.
- **`src/modules/inventory/repository.ts`** — Source of `stockLevelRepository`; the test spies on `applyDelta` (for the barrier) and calls `findByProductId` (for level assertions).
- **`src/modules/inventory/model.ts`** — Source of `reservationModel`; used to count held/total reservation documents after the race.

## Notes

- The barrier is a plain-object `Promise` resolved via a mutable `barrier.open` callback. The spy targets a method on a plain object (not a class) so that `jest.spyOn` works under the swc-based mutation-testing harness.
- The test does **not** depend on OS thread scheduling: the barrier makes the interleaving identical on every run.
- The "dangerous" path (both orders take their first line, then both fail on the second) is the scenario the canonical sorted-by-product-id order inside `reserveForOrder` is designed to prevent. The test asserts the invariant holds even under the adversarial interleaving.
- `afterEach` calls `jest.restoreAllMocks()` to undo the `applyDelta` spy between runs.
