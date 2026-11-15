---
source: src/modules/inventory/tests/integration/multi-line-race.test.ts
sha256: ce455fcabfda4c07a3eed055bc92960734e42b450f0e6f37f98b05c87b4302f6
generated_at: 2026-11-14T20:09:05.281943+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/integration/multi-line-race.test.ts

## Purpose

Integration test that fires two `reserveForOrder` calls for the **same two products in opposite line order**, then asserts that exactly one hold stands and the stock level reflects only the winner. The interleaving is forced deterministically (barrier on the repository write) so the race is reproducible on every run rather than scheduler-dependent.

## Key elements

- **`holdLaterReservesUntilFirstWritesLand(firstWrites)`** — Spies on `stockLevelRepository.applyDelta` and holds every `reserve`-reason write after the first `firstWrites` until a Promise resolves (a manual barrier). Non-reserve writes pass through immediately. The spy is attached to a plain-object method so `jest.spyOn` is safe under the swc mutation harness.
- **`describe` / `it` block** — Creates two products (5 units each) via `createProduct`, then races two 3-unit multi-line reservations. Asserts: exactly 1 of 2 holds is `held`, `reserved`/`available` levels match the winner, and the loser's record is `released` (never deleted).

## Relationships

- **`src/modules/inventory/services/index.ts`** — Imports `inventoryService`; the test calls its `reserveForOrder` method twice to create the racing holds.
- **`src/modules/inventory/repository.ts`** — Imports `stockLevelRepository`; the barrier spy wraps `applyDelta`, and `findByProductId` is used to read back and assert stock levels.
- **`src/modules/inventory/model.ts`** — Imports `reservationModel`; `countDocuments` is used to verify held/released document counts after the race.
- **`src/modules/products/tests/factories.ts`** — Imports `createProduct` to seed the two test products with `onHand: 5`.
- **`src/types/index.ts`** — Imports `StockMovementReason` so the spy can filter to `reserve`-reason writes only.
- **`tests/support/setup-test-db.ts`** — Imports and calls `setupTestDb()` at module scope to initialise the in-memory database.

## Notes

- `setupTestDb()` is called **at module top-level**, not in a `beforeAll`/`beforeEach`. Jest executes it once when the file loads.
- The barrier's settle counter increments in `.finally()`, so a rejected write (e.g. write-conflict retry) still opens the barrier; without this, a single failure would hang the test forever.
- The spy only intercepts writes where `reason === StockMovementReason.reserve`; all other `applyDelta` calls (releases, adjustments) pass through to the real implementation.
- The test relies on `reserveForOrder` sorting lines by product id internally (canonical order). If that ordering were removed, both orders would take their first line before either's second and both would be refused despite sufficient stock.
