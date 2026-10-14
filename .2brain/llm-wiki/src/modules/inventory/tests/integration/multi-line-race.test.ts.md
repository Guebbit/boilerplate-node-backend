---
source: src/modules/inventory/tests/integration/multi-line-race.test.ts
sha256: 8fe1edc3ec019da22ad81c8935f2be9fad944701f9906f1761fefcaca887f32e
generated_at: 2026-10-14T16:02:08.450838+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/integration/multi-line-race.test.ts

## Purpose

Integration test that verifies two concurrent `reserveForOrder` calls—each holding the same two products but listing them in opposite order—cannot both fail when stock is sufficient for exactly one. It pins the interleaving deterministically (via a write-barrier) so the test asserts the invariant "exactly one stands, level reflects the standing holds" rather than depending on the scheduler.

## Key elements

- **`holdLaterReservesUntilFirstWritesLand(firstWrites: number)`** — Spies on `stockLevelRepository.applyDelta` and blocks any `reserve`-reason write past the first `firstWrites` until those first writes have all completed. Uses a plain-object barrier (not a `Promise` constructor trick) so it stays safe under the swc mutation harness.
- **`describe` / `it` block** — Creates two products (5 units each), fires two `reserveForOrder` calls in parallel (order A: left→right, order B: right→left, each requesting 3), then asserts:
  - exactly 1 outcome is `held`;
  - `reservationModel` document counts (held and total) equal the standing count;
  - per-product `reserved` equals `standing × 3` and `available` equals `5 − standing × 3`.

## Relationships

- **`src/modules/inventory/services/index.ts`** — Imports `reserveForOrder`, the function under test (defined in `services/reserve.ts`).
- **`src/modules/inventory/repository.ts`** — Imports `stockLevelRepository`; the test both spies on `applyDelta` (to build the barrier) and reads `findByProductId` to assert post-race levels.
- **`src/modules/inventory/model.ts`** — Imports `reservationModel` to assert persisted hold counts.
- **`src/modules/products/tests/factories.ts`** — Imports `createProduct` to seed inventory with known `onHand` values.
- **`src/types/index.ts`** — Imports `StockMovementReason.reserve` to distinguish reserve writes from other deltas inside the spy.
- **`tests/support/setup-test-db.ts`** — Calls `setupTestDb()` to initialise a real (non-mocked) database for this integration test.

## Notes

- The barrier intercepts **all** `applyDelta` calls but only gates those with `reason === StockMovementReason.reserve`; other reasons pass through immediately.
- Because `reserveForOrder` internally sorts lines by product id before writing, both orders contend on the same first product—this is what makes the "opposite order" scenario a true race rather than a trivial sequential one.
- The spy is implemented on a plain object method (not an arrow/class-bound function) specifically so `jest.spyOn` works under the project's swc-based mutation-testing harness.
- The test restores all mocks in `afterEach` via `jest.restoreAllMocks()`; no manual un-spy is needed.
