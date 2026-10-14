---
source: src/modules/inventory/tests/integration/ledger.property.test.ts
sha256: 07a6d8b7eb0e9ce84e33c2e7dee73a29ee443352c8ae1d8920b8303520357af7
generated_at: 2026-10-14T16:01:51.590703+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/integration/ledger.property.test.ts

## Purpose

Property-based integration test that verifies the stock-movement ledger for a product is a faithful replay of its stored `onHand` and `reserved` counters. Instead of enumerating example transitions, it generates random sequences of caller-visible operations (via `fast-check`), executes them against a real MongoDB instance, then asserts that summing the ledger rows reproduces the counters exactly. The file also asserts two invariants: counters never go negative, and a refused transition writes no row.

## Key elements

- **`RUN`** — shared `fc.assert` config: fixed seed (`20_260_817`), run count from `PROPERTY_RUNS_WITH_DATABASE`, `endOnFailure: true`.
- **`OPENING_ON_HAND`** (500) — starting inventory level for every generated case; large enough that a sequence of receipts/reserves can actually move counters (a fully-refused sequence would satisfy the property trivially).
- **`Step`** (type) — union of the seven operations a caller can issue: `receive`, `adjust`, `reserve`, `commit`, `ship`, `release`, `expire`.
- **`step()`** — `fc.Arbitrary<Step>` that produces random steps; `adjust` deltas exclude zero to mirror the endpoint guard.
- **`play(productId, steps)`** — drives a generated sequence through `inventoryService`, tracking at most one open hold (order id + paid flag) so `commit`/`ship`/`release`/`expire` resolve a single live reservation. Order IDs are derived from a counter (not random) so a failing run replays identically.
- **`replay(productId)`** — reads raw `stockMovementModel` rows for the product and sums `onHandDelta` / `reservedDelta` columns.
- **Three specs** under `describe('the ledger reproduces the counters')`:
  1. Stored counters equal opening balance + ledger delta.
  2. Neither counter goes negative, and `reserved ≤ onHand`.
  3. A single deterministic refusal case (reserve 99 from stock of 2) produces zero ledger rows.

## Relationships

- **`src/modules/inventory/services/index.ts`** — `inventoryService` is the API under test; every step in `play` calls one of its public methods (`receive`, `adjust`, `reserveForOrder`, `commitForOrder`, `shipForOrder`, `releaseForOrder`, `releaseCommittedForOrder`).
- **`src/modules/inventory/model.ts`** — `stockMovementModel` is queried directly in `replay()` to read raw ledger rows and compute expected deltas.
- **`src/modules/inventory/repository.ts`** — `stockMovementRepository.search` is used in the refusal spec to confirm the repository layer also reports zero items.
- **`src/modules/products/index.ts`** — `productService.findByIdRaw` reads the stored counters to compare against the ledger replay.
- **`src/modules/products/tests/factories.ts`** — `createProduct` seeds a product with a known `onHand` / `reserved` before each property run.
- **`src/types/index.ts`** — `StockMovementReason.expire` is passed to `releaseForOrder` in the expire branch.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module load to provision the real Mongo connection.
- **`tests/support/knobs.ts`** — `PROPERTY_RUNS_WITH_DATABASE` controls how many property cases execute per spec.

## Notes

- **No mocks.** The test deliberately runs against real MongoDB; mocking the repository would only re-verify `counterDeltaFor` arithmetic rather than the write-path coupling between counter mutation and ledger row insertion.
- **One open hold at a time.** `play` enforces a single active reservation (skipping `reserve` if one is already open). This mirrors a realistic one-order-at-a-time caller and keeps the state machine tractable for the 1–25 step sequences.
- **Seeded and replayable.** The fixed seed plus derived (counter-based) order IDs mean a failing run can be reproduced exactly by re-running the file.
- **The third spec is deterministic, not property-based.** It exists to pin the "no row on refusal" guarantee with the cheapest possible case rather than relying on the property generator to stumble on a refusal.
- **Adjust deltas exclude zero** to match the endpoint's own guard; a zero-delta adjust is a no-op that the API rejects.
