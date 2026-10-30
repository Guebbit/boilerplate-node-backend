---
source: src/modules/inventory/tests/integration/hold-crash-window.test.ts
sha256: fcb882ecf5048595c43cfa03fefefeca619de301049cfb65f760e433a2a20dfe
generated_at: 2026-10-29T04:06:56.245380+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/integration/hold-crash-window.test.ts

## Purpose

Integration test verifying that the claim-and-move-counter transaction in inventory operations is atomic. If a write throws mid-transaction (simulating a dropped connection), the status claim is rolled back alongside any counters already applied, so a subsequent retry succeeds instead of hitting a "hold already closed" guard.

## Key elements

- **`failOnce(reason)`** — Spies on `stockLevelRepository.applyDelta` and makes the *next* call matching the given `StockMovementReason` reject with `"connection reset"`, then delegates to the real implementation.
- **`levelOf(productId)`** — Reads the current `{ onHand, reserved }` counters for a product via `stockLevelRepository.findByProductId`.
- **`describe('a crash between the claim and the counter move')`** — Three tests (`shipForOrder`, `releaseForOrder`, `releaseCommittedForOrder`) that each: set up a valid hold, arm `failOnce`, assert the first call throws, assert the hold status is unchanged, then assert the retry completes and counters are correct.
- **`describe('a line whose counters refuse')`** — Multi-line test: pre-corrupts a second line's `reserved` to 0 via `stockLevelModel.updateOne`, asserts `shipForOrder` throws `"the counters refused"`, and confirms the first line's counters and the hold's `held` status were rolled back.

## Relationships

- **`src/modules/inventory/services/index.ts`** — `inventoryService` is the system under test; all reserve/commit/ship/release calls go through it.
- **`src/modules/inventory/repository.ts`** — `stockLevelRepository` is both mocked (via `failOnce`) and read (via `levelOf`); `reservationRepository` is read to assert hold status after a crash.
- **`src/modules/inventory/model.ts`** — `stockLevelModel` is used directly (Mongoose `updateOne`) to create an inconsistent state for the "counters refuse" test.
- **`src/modules/products/tests/factories.ts`** — `createProduct` seeds products with a known `onHand` count.
- **`src/types/index.ts`** — Provides the `StockMovementReason` enum values used to target `failOnce`.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the in-memory DB before all tests run.

## Notes

- The test file is a **module** (side-effect import); it has no exports.
- `ORDER` is a 24-char string of `"e"` — valid as a MongoDB ObjectId so it satisfies repository constraints without needing a real generator.
- `failOnce` only intercepts the *first* matching call; all subsequent calls pass through to the real `applyDelta`. The spy is cleaned up by `jest.restoreAllMocks()` in `afterEach`.
- The "counters refuse" test deliberately bypasses the service layer to corrupt state (`stockLevelModel.updateOne`), simulating a pre-existing data inconsistency rather than a mid-transaction crash.
