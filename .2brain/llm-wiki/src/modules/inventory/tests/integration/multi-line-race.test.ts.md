---
source: src/modules/inventory/tests/integration/multi-line-race.test.ts
sha256: b64381afc861a4c23d961fabf45804fc499b250374b8b8e2a8d82db221635d6f
generated_at: 2026-10-29T04:07:22.676693+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/integration/multi-line-race.test.ts

## Purpose

Integration test that proves `reserveForOrder` correctly serialises two concurrent multi-line holds that list the **same two products in opposite order**. By forcing a deterministic interleaving (both first-line writes land before any second-line write starts), it verifies that exactly one hold stands, the stock level reflects only the standing hold, and a refused hold leaves no residue.

## Key elements

- **`holdLaterReservesUntilFirstWritesLand(firstWrites: number)`** – Spies on `stockLevelRepository.applyDelta`; lets the first `firstWrites` reserve writes proceed, then blocks all subsequent reserve writes until a Promise barrier resolves. Returns nothing; installed via `jest.spyOn`.
- **`describe` / `it` block** – Creates two products (5 units each), issues two 2-line reservations (3 units each) in opposite product order via `Promise.all`, then asserts:
  - exactly one outcome has `held === true`;
  - `reservationModel` document counts equal the number of standing holds;
  - per-product `reserved` and `available` levels match the standing hold's quantity.

## Relationships

- **`src/modules/inventory/services/index.ts`** – Under-test target: `inventoryService.reserveForOrder` is the function whose atomicity this test exercises.
- **`src/modules/inventory/repository.ts`** – `stockLevelRepository.applyDelta` is spied on to implement the barrier; `findByProductId` is called in assertions to read final levels.
- **`src/modules/inventory/model.ts`** – `reservationModel.countDocuments` verifies no phantom reservation documents remain after a refused hold.
- **`src/modules/products/tests/factories.ts`** – `createProduct` seeds the two inventory-bearing products used by the scenario.
- **`src/types/index.ts`** – `StockMovementReason.reserve` discriminates which `applyDelta` calls the barrier intercepts.
- **`tests/support/setup-test-db.ts`** – `setupTestDb` initialises the in-memory database for the test file (called once at module top level).

## Notes

- The barrier intentionally targets **only** `reserve`-reason writes; all other `applyDelta` calls (e.g. internal compensations) pass through unimpeded.
- `holdLaterReservesUntilFirstWritesLand` is a plain object method (not a class method) specifically so `jest.spyOn` works under the **swc** mutation harness, which the header comment calls out.
- The test relies on `reserveForOrder` sorting lines by product ID before writing. If that canonical-ordering guarantee is removed, both holds could interleave and both be refused despite sufficient stock — this test would catch that regression.
- Order IDs are fixed 24-char strings (`'a'.repeat(24)`, `'b'.repeat(24)`) — likely satisfying a length constraint on the reservation model rather than being semantically meaningful.
