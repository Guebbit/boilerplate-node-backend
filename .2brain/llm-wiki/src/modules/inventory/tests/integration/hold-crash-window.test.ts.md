---
source: src/modules/inventory/tests/integration/hold-crash-window.test.ts
sha256: fcb882ecf5048595c43cfa03fefefeca619de301049cfb65f760e433a2a20dfe
generated_at: 2026-11-08T06:05:52.246497+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/integration/hold-crash-window.test.ts

## Purpose

Integration tests that verify the inventory service's claim-then-move pattern is atomic: if the write that moves stock counters fails mid-transaction (simulating a dropped connection), the hold's status claim is rolled back too, so a retry re-claims and completes the work instead of hitting an "already done" short-circuit with counters still unchanged.

## Key elements

- **`failOnce(reason)`** — Spies on `stockLevelRepository.applyDelta` so the first call matching the given `StockMovementReason` rejects with `"connection reset"`, then delegates to the real implementation. Simulates a crash between the status claim and the counter write.
- **`levelOf(productId)`** — Reads the stock-level row and returns `{ onHand, reserved }` for assertions.
- **`describe('a crash between the claim and the counter move')`** — Three scenarios (ship, release, release-committed) that each: set up a reservation, arm `failOnce`, assert the failed call rejects, assert the hold's status is unchanged, retry, and assert final counters are correct.
- **`describe('a line whose counters refuse')`** — Deliberately corrupts a level row (`reserved: 0` while the hold says 4 units are reserved) to exercise the service's guard that throws `"the counters refused"`. Verifies the status claim is rolled back and an earlier line's counters are restored.
- **`ORDER`** — A 24-char hex string (`'e'.repeat(24)`) valid as a MongoDB ObjectId, used as the order identifier throughout.

## Relationships

- **`src/modules/inventory/services/index.ts`** — Imports `inventoryService`; calls `reserveForOrder`, `commitForOrder`, `shipForOrder`, `releaseForOrder`, `releaseCommittedForOrder`.
- **`src/modules/inventory/repository.ts`** — Imports `reservationRepository` (read hold status after failures) and `stockLevelRepository` (read counters; target of the `failOnce` spy).
- **`src/modules/inventory/model.ts`** — Imports `stockLevelModel` to directly corrupt a row (`$set: { reserved: 0 }`) in the "counters refuse" test.
- **`src/modules/products/tests/factories.ts`** — Imports `createProduct` to seed a product with a known `onHand`.
- **`src/types/index.ts`** — Imports `StockMovementReason` (`.ship`, `.release`) used to target the spy.
- **`tests/support/setup-test-db.ts`** — Imports `setupTestDb` to point Mongoose at an in-memory/test MongoDB instance.

## Notes

- The spy is placed at the **repository** level (`stockLevelRepository.applyDelta`), not the service level, so it fires mid-transaction after the status claim has already been written—precisely the crash window under test.
- `failOnce` is armed *after* the reservation (and optionally commit) is in place, so the setup writes go through the real path.
- The "counters refuse" test uses `stockLevelModel.updateOne` directly, bypassing the service, to create an intentionally inconsistent state that the service's internal validation must catch.
- `afterEach` calls `jest.restoreAllMocks()` to clean up the spy between tests.
- Assertions check **both** the hold's status (unchanged after failure) and the final counters (correct after retry), covering both halves of the atomicity guarantee.
