# src/modules/inventory/tests/integration/ledger.property.test.ts

## Purpose

Property-based integration tests that verify the stock-movement ledger is a faithful, gap-free account of every counter change. By generating random sequences of caller-facing inventory operations against a real MongoDB and asserting that replaying ledger rows exactly reproduces the stored `onHand` and `reserved` counters, the file pins down the invariant that a row is written if and only if a conditional write succeeds.

## Key elements

- **`RUN`** — Shared seed (20260817), run count (40), and `endOnFailure` flag for all `fc.assert` calls in this file.
- **`OPENING_ON_HAND`** (500) — Starting balance for every generated case; large enough that sequences aren't trivially all-refused.
- **`Step`** — Discriminated union of the six caller-facing operations: `receive`, `adjust`, `reserve`, `commit`, `release`, `expire`.
- **`step()`** — `fc.Arbitrary<Step>` that weights the six kinds and bounds quantities (e.g. adjust delta −40…40, zero excluded).
- **`play(productId, steps)`** — Executes a generated sequence through `inventoryService`, maintaining a single open order hold and derived (non-random) order IDs for deterministic replay.
- **`replay(productId)`** — Sums `onHandDelta` and `reservedDelta` across all ledger rows for the product; returns row count.
- **Test: "replaying every row lands exactly on both stored counters"** — Core property: `stored.counter == opening + sum(ledger delta)`.
- **Test: "never lets either counter go negative"** — Invariant: both counters ≥ 0 and `reserved ≤ onHand` after any sequence.
- **Test: "writes no row for a transition that was refused"** — Negative check: a reservation that exceeds stock produces zero ledger rows and an empty repository search.

## Relationships

- **`src/modules/inventory/index.ts`** — Source of the `inventoryService` under test (delegates to `service.ts`).
- **`src/modules/inventory/model.ts`** — `stockMovementModel` is queried directly in `replay()` to read raw ledger rows.
- **`src/modules/inventory/repository.ts`** — `stockMovementRepository.search` is used in the refused-transition test to confirm zero rows.
- **`src/modules/products/index.ts`** — Exports `productRepository`, used to read the stored counters after each sequence.
- **`src/modules/products/tests/factory.ts`** — `createProduct` builds the test fixture with a known opening balance.
- **`src/types/index.ts`** — Provides `StockMovementReason.expire` for the expire step.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` provisions a real MongoDB instance at module load; the tests depend on its conditional-write semantics.

## Notes

- The file deliberately drives the **public service surface** (`receive`, `reserveForOrder`, `commitForOrder`, etc.), not the internal `applyTransition`, so the property is asserted against the API a caller actually uses.
- Only **one live order hold** is tracked at a time (`openOrderId`); `reserve` is a no-op while a hold is open, and `commit`/`release`/`expire` are no-ops while none is open. This mirrors the one-hold-per-order shop rule and keeps generated sequences realistic.
- Order IDs are **derived from a counter** (hex-padded), not random, so a failing seed replays identically.
- A passing run is not luck: the seed is fixed in `RUN`. If a new counterexample is found, the convention is to record it as a plain `it()` with the seed in a comment, leaving the property as the general rule.
- `setupTestDb()` runs at **module top-level**, before the `describe` block; forgetting this (or running the file without the DB) will cause all assertions to fail at the repository layer rather than surface the property under test.
