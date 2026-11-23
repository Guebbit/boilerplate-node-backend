---
source: src/modules/inventory/tests/integration/ledger.property.test.ts
source_sha256: 48ff93c31a364854071184c3dc930539578e46118e29d4430811b807461d2df9
context_sha256: 39d2cf24b356f8618366ce47b97b5f7d8ff42cfb6ac23902028b86437d3ec635
generated_at: 2026-11-22T05:26:49.874802+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/tests/integration/ledger.property.test.ts

## Purpose
A property-based integration test (fast-check, against a real Mongo database) asserting that replaying a product's stock-movement ledger reproduces its stored counters for any generated sequence of inventory operations. It exists because ledger rows are written by the same conditional write that moves the counter, so the two must never diverge. It uses real Mongo rather than mocks, and runs with a fixed seed for reproducibility.

## Key elements
- `RUN`: shared fast-check config with a fixed seed (`20_260_817`), `numRuns` from `PROPERTY_RUNS_WITH_DATABASE` (env `TEST_PROPERTY_RUNS_DB`), and `endOnFailure: true`.
- `OPENING_ON_HAND` (500): the starting `onHand` for every case, so sequences have room to move rather than being refused wholesale.
- `Step` / `step()`: arbitrary for caller-level operations: `receive`, `adjust` (non-zero delta, -40..40), `reserve`, `commit`, `ship`, `release`, `expire`.
- `play(productId, steps)`: runs a sequence through `inventoryService`. It tracks at most one open hold per order, with deterministic order ids (a hex counter padded to 24 chars) and an "is paid" flag. Steps that don't apply to the current hold state are skipped. `expire` and unpaid `release` go through `releaseForOrder` (with `StockMovementReason.expire` for expiry). Paid `release` goes through `releaseCommittedForOrder`.
- `replay(productId)`: reads all `stockMovementModel` rows for the product and sums `onHandDelta`, `reservedDelta`, and the row count.
- Tests, in `describe('the ledger reproduces the counters')`:
  - Replaying all rows gives `onHand === 500 + sum(onHandDelta)` and `reserved === sum(reservedDelta)`.
  - Neither counter goes negative, and `reserved <= onHand`.
  - A refused reservation (99 against `onHand` 2) returns `held: false` and writes no ledger rows. This is checked with `replay` and with `stockMovementRepository.search`, which returns empty items and `totalItems` 0.

## Relationships
- `../../services` (`inventoryService`): the only write path used (`receive`, `adjust`, `reserveForOrder`, `commitForOrder`, `shipForOrder`, `releaseForOrder`, `releaseCommittedForOrder`).
- `../../model` (`stockMovementModel`): queried directly to replay ledger rows.
- `../../repository` (`stockMovementRepository`): `search` is used to confirm the refused-transition case leaves an empty ledger.
- `@modules/products/tests/factories`: `createProduct` seeds products, and `countersOf` reads the stored counters.
- `@types`: supplies `StockMovementReason` (`expire`).
- `@tests/setup-test-db`: `setupTestDb()` provisions the database.
- `@tests/knobs`: provides `PROPERTY_RUNS_WITH_DATABASE`.
- `@tests/callers`: provides `testCallerContext`, passed to `receive` and `adjust`.

## Notes
- The opening balance is not in the ledger, so the assertions compare against `OPENING_ON_HAND + ledger delta`, as an account statement would.
- Steps are written in the vocabulary of outside callers rather than calling the private `applyTransition` chokepoint directly.
- Order ids are derived, not random, so failing runs replay identically.
- `commit` only applies to an unpaid open hold, and `expire` only to an unpaid hold (the sweep only expires unpaid holds).
- Each property run creates a fresh product, so runs don't share state.
