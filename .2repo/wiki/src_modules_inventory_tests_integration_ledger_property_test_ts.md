# src/modules/inventory/tests/integration/ledger.property.test.ts

## Purpose

Property-based integration test that verifies a product's stock-movement ledger is a complete and faithful record of its stored counters. Using `fast-check` to generate random sequences of caller-visible operations (receive, adjust, reserve/commit/release/expire), it replays the ledger rows against a **real** MongoDB instance and asserts the sums match the stored `onHand` and `reserved` values exactly. It exists because the correctness guarantee—"a row is written by the same conditional write that moves the counter"—is best proven over an unbounded space of sequences rather than a fixed table of examples.

## Key elements

- **`RUN`** — Runner config: fixed seed `20_260_817`, 40 runs, `endOnFailure: true`. Single place to change reproducibility settings.
- **`OPENING_ON_HAND`** — Starting `onHand` balance (500) so generated sequences have room to move without trivially refusing end-to-end.
- **`Step`** (type) — Union of the six caller-visible operations: `receive`, `adjust`, `reserve`, `commit`, `release`, `expire`. Deliberately models the *service API*, not the internal `applyTransition` chokepoint.
- **`step()`** — `fc.Arbitrary<Step>` that randomly picks one of the six, with bounded quantities. `adjust` filters out zero to match the API's own constraint.
- **`play(productId, steps)`** — Drives a generated sequence against `inventoryService`. Maintains a single open-order id (one live hold at a time); skips `reserve` if one is open and `commit`/`release`/`expire` if none is. Derives order IDs deterministically from a counter so failures replay identically.
- **`replay(productId)`** — Reads all `stockMovementModel` rows for the product and sums `onHandDelta` / `reservedDelta`, returning the totals plus row count.
- **Test: "replaying every row lands exactly on both stored counters"** — Asserts `stored.onHand === OPENING_ON_HAND + ledger.onHandDelta` and `stored.reserved === 0 + ledger.reservedDelta`.
- **Test: "never lets either counter go negative"** — Asserts both counters ≥ 0 and `reserved ≤ onHand` for every generated sequence.
- **Test: "writes no row for a transition that was refused"** — Concrete (non-property) case: reserving 99 from a product with `onHand: 2` must return `held: false` and produce zero ledger rows, verified via both the model and the repository's `search`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/inventory/index.ts` | Exports `inventoryService` — the sole API surface the test drives (receive, adjust, reserveForOrder, commitForOrder, releaseForOrder). |
| `src/modules/inventory/service.ts` | Underlying implementation behind `inventoryService`; the property test's target invariant lives here. |
| `src/modules/inventory/model.ts` | Exports `stockMovementModel` (Mongoose) — used by `replay()` to read raw ledger rows for summing. |
| `src/modules/inventory/repository.ts` | Exports `stockMovementRepository` — used in the refusal test to confirm `search` returns zero items. |
| `src/modules/products/index.ts` | Exports `productRepository` — used to read the stored `onHand`/`reserved` counters after a run. |
| `src/modules/products/repository.ts` | Underlying implementation behind `productRepository.findByIdRaw`. |
| `src/modules/products/tests/fixtures.ts` | Exports `createProduct` — seeds a product with a known `onHand`/`reserved` before each property case. |
| `src/types/index.ts` | Exports `StockMovementReason.expire` — passed to `releaseForOrder` in the `expire` step. |
| `tests/support/setup-test-db.ts` | Exports `setupTestDb` — connects to a real MongoDB instance; called once at module load. |

## Notes

- **Real database, no mocks.** The module docblock explicitly states that mocking the repository would only re-test `counterDeltaFor` arithmetic. `setupTestDb()` is invoked at import time, not per-test.
- **One open hold at a time.** `play()` silently skips a `reserve` if an order is already open and skips `commit`/`release`/`expire` if none is. This mirrors a single-order scenario and keeps the reservation lifecycle well-formed; it does *not* test concurrent multi-order contention.
- **`expire` is `releaseForOrder` + a reason flag.** There is no dedicated `expireForOrder` service method; the test calls `releaseForOrder(orderId, StockMovementReason.expire)`.
- **Deterministic order IDs.** Order IDs are derived from an incrementing counter formatted as 24-char hex, not randomly generated, so a failing seed replays identically.
- **`adjust` quantity range is `[-40, 40]` excluding 0**, matching the service's own validation boundary.
