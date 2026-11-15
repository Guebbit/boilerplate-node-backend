---
source: src/modules/inventory/tests/integration/hold-crash-window.test.ts
sha256: b319388963463821151fbc3c52165b995a72ce0b8ed95bd33a2052d8093e1b3b
generated_at: 2026-11-14T20:08:42.637307+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/integration/hold-crash-window.test.ts

## Purpose

Integration test that verifies the atomicity guarantee of inventory status transitions: if a write fails partway through a hold-status claim + counter move (simulated as a dropped connection), the entire operation—including the status claim—is rolled back so a retry can re-claim and finish cleanly. Covers ship, release, releaseCommitted, reserve-unwind, and the reservation sweep interacting with a mid-reserve crash.

## Key elements

- **`failOnce(reason: StockMovementReason)`** – Spies on `stockLevelRepository.applyDelta`; the first call matching the given reason rejects with `'connection reset'`, subsequent calls delegate to the real implementation. Simulates a single dropped write.
- **`levelOf(productId)`** – Reads the stock-level row and returns `{ onHand, reserved }` for assertion.
- **`ledgerIdsOf(orderId)`** – Returns the ordered `_id`s of `stockMovementModel` rows referencing the order, used to verify the sweep didn't double-write.
- **`itemCount()`** – Returns the current number of line items on the order's reservation hold (polling helper).
- **`describe("a crash between the claim and the counter move")`** – Three tests (ship, release, releaseCommitted) asserting that after a failed call the hold status is unchanged and a retry reaches the correct final counters.
- **`describe("a line whose counters refuse")`** – Verifies that when a line's preconditions fail ("the counters refused"), the hold status and all earlier lines' counters are rolled back.
- **`describe("a checkout killed between two lines")`** – Uses a gate-based mock to hold the second line's `applyDelta` open, lets the sweep expire and release the hold, then confirms the sweep freed only the line it actually took and left the other order's reservations untouched.
- **`describe("a rollback whose release throws")`** – A reserve fails on a missing product; the unwind's release write also throws. Asserts the hold stays `held` (not silently released) and a later sweep frees the units.
- **`describe("a checkout unwinding while the sweep … is still finishing")`** – Gate-mocks both `applyDelta` and `reservationRepository.findByOrderId` to interleave the sweep's post-commit read with the checkout's unwind; asserts the stock-level cache ends consistent with the level row.

## Relationships

- **`src/modules/inventory/model.ts`** – Imports `stockLevelModel`, `reservationModel`, `stockMovementModel` for direct DB state inspection (bypassing the service layer) in assertions and for corrupting preconditions.
- **`src/modules/inventory/repository.ts`** – Imports `reservationRepository` and `stockLevelRepository`; spies on `applyDelta` and `findByOrderId` to inject failures and gates.
- **`src/modules/inventory/services/index.ts`** – Imports `inventoryService`; all happy-path and failing-path calls go through its `reserveForOrder`, `commitForOrder`, `shipForOrder`, `releaseForOrder`, `releaseCommittedForOrder`, and `runReservationSweep` methods.
- **`src/modules/products/tests/factories.ts`** – Imports `createProduct` to seed stock levels (and `countersOf`, though unused in the visible portion).
- **`src/types/index.ts`** – Imports `StockMovementReason` for the `failOnce` discriminator.
- **`tests/support/setup-test-db.ts`** – Calls `setupTestDb()` once at module scope to initialise the in-memory Mongo for the test run.

## Notes

- The file mutates `stockLevelRepository` and `reservationRepository` via `jest.spyOn`; `afterEach` calls `jest.restoreAllMocks()` to prevent leakage.
- Gate-based concurrency tests (sweep interleaving) use a `{ open?: () => void }` pattern: a promise is stored in the gate object, the mock awaits it, and the test body calls `gate.open()` to release. The release call is always placed *after* assertions to avoid releasing before the test can read state.
- `ORDER` is a 24-char string of `'e'` (valid ObjectId shape) to avoid importing a real ObjectId generator.
- The "counters refuse" test directly writes `reserved: 0` via `stockLevelModel.updateOne` to create the precondition mismatch—this is intentional corruption, not a bug.
- The `failOnce` spy checks `armed && why === reason`, so only the first matching call fails; a second line of the same reason in the same call will proceed normally.
