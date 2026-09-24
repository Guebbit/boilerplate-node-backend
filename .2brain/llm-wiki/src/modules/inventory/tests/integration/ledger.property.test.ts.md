---
source: src/modules/inventory/tests/integration/ledger.property.test.ts
sha256: c6bd99be0c7f9ea8e2d0e4282e2cf08576e887ab6f60a8aadcbcdd109f41f850
generated_at: 2026-09-23T18:46:48.439043+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/integration/ledger.property.test.ts

## Purpose

Property-based integration test that verifies the core invariant of the inventory module: replaying every stock-movement ledger row for a product reproduces its stored `onHand` and `reserved` counters exactly, for *all* generated sequences of transitions rather than a fixed set of examples. It runs against a real MongoDB instance so that the conditional-write coupling between ledger rows and counter updates is exercised end-to-end.

## Key elements

- **`RUN`** — Shared fast-check config: fixed seed (`20_260_817`), run count from `PROPERTY_RUNS_WITH_DATABASE`, and `endOnFailure: true` so a single counterexample halts the suite.
- **`OPENING_ON_HAND`** (500) — Starting stock for every case; large enough that a generated sequence of receipts/reserves has room to move, preventing the property from being trivially satisfied by an all-refusal sequence.
- **`Step`** (type) — Union of the six caller-visible operations: `receive`, `adjust`, `reserve`, `commit`, `release`, `expire`. Deliberately excludes direct calls to the private `applyTransition` chokepoint.
- **`step()`** — `fc.Arbitrary<Step>` generator; `adjust` deltas exclude zero (matching the endpoint's own validation).
- **`play(productId, steps)`** — Drives a generated sequence through the public `inventoryService` API. Maintains a single open hold (one order at a time) with a deterministically derived ObjectId so a failing run replays identically.
- **`replay(productId)`** — Queries raw `stockMovementModel` rows for the product and sums `onHandDelta` / `reservedDelta` to produce the "ledger says" totals.
- **Three test cases** in `describe('the ledger reproduces the counters')`:
  1. *Replaying every row lands exactly on both stored counters* — property-based equality check.
  2. *Never lets either counter go negative* — property-based non-negativity and `reserved ≤ onHand` invariant.
  3. *Writes no row for a transition that was refused* — single deterministic case: reserving more than exists must leave zero ledger rows.

## Relationships

- **`src/modules/inventory/service.ts`** (`inventoryService`) — The system under test; every `Step` is dispatched through its public methods (`receive`, `adjust`, `reserveForOrder`, `commitForOrder`, `releaseForOrder`).
- **`src/modules/inventory/repository.ts`** (`stockMovementRepository`) — Used in the "no row" test to confirm the search returns an empty result set and zero `meta.totalItems`.
- **`src/modules/inventory/model.ts`** (`stockMovementModel`) — Queried directly in `replay()` to read raw ledger rows for summation.
- **`src/modules/products/tests/factories.ts`** (`createProduct`) — Creates a product document with a specified `onHand` / `reserved` count before each property case.
- **`src/modules/products/index.ts` / `service.ts`** (`productService.findByIdRaw`) — Reads back the stored counters to compare against the ledger replay.
- **`src/types/index.ts`** (`StockMovementReason`) — Supplies the `expire` reason enum value passed to `releaseForOrder`.
- **`tests/support/setup-test-db.ts`** (`setupTestDb`) — Initialises the real MongoDB connection the file depends on.
- **`tests/support/knobs.ts`** (`PROPERTY_RUNS_WITH_DATABASE`) — Controls how many property runs execute when the test hits a live database.

## Notes

- The test intentionally drives the **public service API**, not the internal `applyTransition` method. This ensures the property verifies the full path (validation → conditional write → ledger row) rather than just arithmetic self-consistency.
- Only **one hold** (reservation) is open at any time per product, mirroring real usage where each order has its own hold. Generated `commit`/`release`/`expire` steps are no-ops if no hold is open.
- Order IDs are **derived** (`(++counter).toString(16).padStart(24, 'a')`) rather than random, so a failing seed replays the exact same identifiers.
- The "no row for refused transition" test is **not** property-based; it is a single deterministic assertion using a product with `onHand: 2` and a reserve request for 99.
- The `OPENING_ON_HAND` comment explicitly warns that a small starting value would make the property trivially true if every step were refused — the 500 buffer prevents that degenerate case.
