---
source: src/modules/inventory/tests/integration/ledger.property.test.ts
sha256: 51e96ba6d789606fddcf1aea775b7d0a2ea7b06eb74a590be3ab5d834072ff0f
generated_at: 2026-11-08T06:06:09.073142+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/integration/ledger.property.test.ts

## Purpose

Property-based integration test that verifies the inventory ledger (stock-movement rows) faithfully reproduces a product's `onHand` and `reserved` counters for *every* generated sequence of transitions, not just a fixed table of examples. It runs against real MongoDB because the invariant under test is the atomicity of the conditional write that moves a counter and inserts a ledger row simultaneously; mocking the repository would only re-test `counterDeltaFor`'s arithmetic.

## Key elements

- **`RUN`** – Fast-check config constant: fixed seed (`20_260_817`), run count from `PROPERTY_RUNS_WITH_DATABASE`, `endOnFailure: true`.
- **`OPENING_ON_HAND`** – Starting inventory (500), deliberately large so a generated sequence has room to move and a trivially-refused run (zero rows) cannot vacuously satisfy the property.
- **`Step`** – Union type of the six caller-facing operations: `receive`, `adjust`, `reserve`, `commit`, `ship`, `release`, `expire`.
- **`step()`** – `fc.Arbitrary<Step>` generator; `adjust` deltas are non-zero (mirroring the endpoint's exclusion).
- **`play(productId, steps)`** – Drives a generated sequence through `inventoryService` public methods. Maintains a single open-hold tracker (`openOrderId`, `openIsPaid`) so reservation-lifecycle steps are applied to a real order. Order IDs are derived deterministically (incrementing hex counter) for replay.
- **`replay(productId)`** – Sums `onHandDelta` and `reservedDelta` across all ledger rows for the product; returns the row count.
- **Test: "replaying every row lands exactly on both stored counters"** – Asserts `stored.onHand === OPENING_ON_HAND + ledger.onHandDelta` and `stored.reserved === 0 + ledger.reservedDelta`.
- **Test: "never lets either counter go negative"** – Asserts `onHand ≥ 0`, `reserved ≥ 0`, and `reserved ≤ onHand`.
- **Test: "writes no row for a transition that was refused"** – Plain (non-property) test: over-reserve a product with 2 units, confirm `held === false` and zero ledger rows via both the model and the repository.

## Relationships

- **`src/modules/inventory/services/index.ts`** – Primary system under test; all inventory operations (`receive`, `adjust`, `reserveForOrder`, `commitForOrder`, `shipForOrder`, `releaseForOrder`, `releaseCommittedForOrder`) are called through `inventoryService`.
- **`src/modules/products/index.ts`** – Provides `productService.findByIdRaw` to read the stored counters for assertion.
- **`src/modules/products/tests/factories.ts`** – `createProduct` seeds a product with a known `onHand`/`reserved` before each run.
- **`src/modules/inventory/model.ts`** – `stockMovementModel` queries ledger rows directly in `replay()`.
- **`src/modules/inventory/repository.ts`** – `stockMovementRepository.search` used in the refused-row test to confirm the repository also returns an empty list.
- **`src/types/index.ts`** – `StockMovementReason.expire` passed to `releaseForOrder` in the `expire` step.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` provisions/tears down the real Mongo instance for the suite.
- **`tests/support/knobs.ts`** – `PROPERTY_RUNS_WITH_DATABASE` controls the number of property runs.
- **`tests/support/callers.ts`** – `testCallerContext` supplied as the caller argument to every service call.

## Notes

- **No mocking.** The test intentionally uses real Mongo. The property being proven is that the ledger row and the counter mutation are written by the *same* conditional write; a mock would collapse that guarantee into a tautology.
- **Deterministic order IDs.** `nextOrderId()` increments a counter and pads to 24 hex chars, so a failing seed replays identically without needing a random-seed fixture.
- **Single open hold.** The `play` driver tracks at most one open reservation at a time. Steps that would require a second concurrent hold are silently skipped (guard: `if (openOrderId) break`). This keeps the driver simple but means multi-hold interleavings are not covered here.
- **`adjust` excludes zero** via `.filter(v => v !== 0)`, matching the API's rejection of no-op adjustments.
- **The "no row on refusal" test is not property-based.** It is a single deterministic case (reserve 99 against 2 on-hand) chosen because it is the cheapest way to provoke a refusal and confirm the atomic no-write guarantee.
