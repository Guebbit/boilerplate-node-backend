---
source: src/modules/inventory/tests/integration/hold-crash-window.test.ts
sha256: 77e7b190c8246ee53aed5ca4a4dd1e427f086136e8ec2cd7fe5d5746345753a9
generated_at: 2026-10-14T16:01:24.162478+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/integration/hold-crash-window.test.ts

## Purpose

Integration tests verifying the atomicity guarantee of hold-status transitions: if a write to stock counters fails mid-transaction (simulated by a one-shot `applyDelta` rejection), the hold's status claim is rolled back so a retry can re-claim and complete the work. Also verifies that a counter mismatch on any line rolls back the claim *and* all previously-applied deltas.

## Key elements

- **`failOnce(reason)`** — Spies on `stockLevelRepository.applyDelta`; the first call matching the given `StockMovementReason` rejects with `'connection reset'`, subsequent calls delegate to the real implementation. Models a dropped DB connection.
- **`levelOf(productId)`** — Reads back the `stockLevelRepository` row and returns `{ onHand, reserved }` for assertions.
- **`ORDER`** — A 24-char string valid as a Mongo ObjectId; used as the order key across all tests.
- **`describe('a crash between the claim and the counter move')`** — Three tests (ship, release, release-of-committed) that fail the relevant `applyDelta` once, assert the first call rejects, confirm the hold status is *unchanged* after the failure, retry, and assert counters land in the expected final state.
- **`describe('a line whose counters refuse')`** — Seeds a multi-line order, then corrupts the second product's `reserved` to 0 via `stockLevelModel.updateOne`. Asserts `shipForOrder` rejects with `'the counters refused'`, the hold reverts to `'held'`, and the first product's counters are restored to their pre-ship values.

## Relationships

- **`src/modules/inventory/services/index.ts`** — Barrel import for `reserveForOrder`, `shipForOrder`, `commitForOrder`, `releaseForOrder`, `releaseCommittedForOrder`.
- **`src/modules/inventory/repository.ts`** — `reservationRepository` (read hold status post-failure) and `stockLevelRepository` (mock target and read-back helper).
- **`src/modules/inventory/model.ts`** — `stockLevelModel` used directly to inject an inconsistent `reserved` value, simulating a concurrent write that desynchronises counters from the hold.
- **`src/modules/products/tests/factories.ts`** — `createProduct` seeds deterministic stock levels for each scenario.
- **`src/types/index.ts`** — `StockMovementReason` enum values (`ship`, `release`) identify which `applyDelta` call to sabotage.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` spins up an in-memory MongoDB for the integration context.

## Notes

- Tests assert on hold status *after* the failed call to confirm the claim was rolled back, not merely that the retry succeeds. This is the core invariant under test: "neither half done."
- The counter-refusal test relies on product IDs being sorted (`.toSorted()`) so the "later line" is deterministically the one whose record is corrupted.
- `failOnce` uses a `let armed` flag rather than `mockImplementationOnce`, because the spy must let *other* reasons pass through unchanged in the same call stack.
- `jest.restoreAllMocks()` in `afterEach` prevents the spy from leaking into subsequent tests.
