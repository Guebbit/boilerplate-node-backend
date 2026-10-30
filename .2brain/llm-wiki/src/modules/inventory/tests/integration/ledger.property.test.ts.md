---
source: src/modules/inventory/tests/integration/ledger.property.test.ts
sha256: 51e96ba6d789606fddcf1aea775b7d0a2ea7b06eb74a590be3ab5d834072ff0f
generated_at: 2026-10-29T04:07:12.241825+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/integration/ledger.property.test.ts

## Purpose

Property-based integration test that verifies the stock-movement ledger and the stored counters are always in lockstep: for *any* generated sequence of caller-visible inventory operations (receive, adjust, reserve, commit, ship, release, expire), summing the ledger rows must reproduce the exact `onHand` and `reserved` values, neither counter may go negative, and refused transitions must write zero rows. Runs against real MongoDB (not a mocked repository) so the conditional-write coupling between counter and row is exercised end-to-end.

## Key elements

- **`Step`** — discriminated union of the seven caller-visible operations (`receive`, `adjust`, `reserve`, `commit`, `ship`, `release`, `expire`). Deliberately models the *outside* vocabulary, not the internal `applyTransition` chokepoint.
- **`step()`** — fast-check `Arbitrary<Step>` that randomly picks one of the seven operations with bounded quantities.
- **`play(productId, steps)`** — drives a generated sequence through `inventoryService` methods, tracking at most one open hold (keyed by a deterministic order id) so reservation-lifecycle transitions are exercised realistically.
- **`replay(productId)`** — reads all `stockMovementModel` rows for a product and sums `onHandDelta` / `reservedDelta` to produce the ledger-implied deltas.
- **`RUN`** — fixed seed (`20_260_817`) and run count from `PROPERTY_RUNS_WITH_DATABASE`; `endOnFailure: true` for reproducible replay of a failing case.
- **`OPENING_ON_HAND` (500)** — starting stock per product, large enough that a full refusal (zero rows) cannot trivially satisfy the property.
- **Three `it` blocks** — (1) ledger sums equal stored counters, (2) counters never negative and `reserved ≤ onHand`, (3) a refused reserve writes no rows.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/inventory/services/index.ts` | Primary SUT — calls `inventoryService.receive / adjust / reserveForOrder / commitForOrder / shipForOrder / releaseForOrder / releaseCommittedForOrder`. |
| `src/modules/inventory/model.ts` | Reads `stockMovementModel` rows directly in `replay()` to sum ledger deltas. |
| `src/modules/inventory/repository.ts` | Calls `stockMovementRepository.search()` in the refused-transition test to confirm zero items. |
| `src/modules/products/index.ts` | Calls `productService.findByIdRaw()` to read back the stored counters after a sequence. |
| `src/modules/products/tests/factories.ts` | `createProduct()` seeds each property case with a known `onHand` / `reserved`. |
| `src/types/index.ts` | Imports `StockMovementReason.expire` for the expire step. |
| `tests/support/callers.ts` | `testCallerContext` is passed as the caller argument to every `inventoryService` call. |
| `tests/support/knobs.ts` | `PROPERTY_RUNS_WITH_DATABASE` sets the number of property runs (overridable per environment). |
| `tests/support/setup-test-db.ts` | `setupTestDb()` provisions and tears down a real MongoDB instance for the suite. |

## Notes

- The test drives **only** the public service API. It never calls `applyTransition` or `counterDeltaFor` directly, so a self-consistent-but-wrong internal split would still be caught by the ledger-vs-counter equality assertion.
- Order ids in `play` are derived deterministically (`(++holdCounter).toString(16).padStart(24, 'a')`) so a failing run replays identically under the fixed seed.
- `expire` is gated on the hold being *unpaid*; `release` handles both paid and unpaid paths, matching the two distinct service methods (`releaseForOrder` vs `releaseCommittedForOrder`).
- The run count is an environment knob (`PROPERTY_RUNS_WITH_DATABASE`), not a hard-coded number, so CI can dial it up without touching the file.
- The refused-transition test uses `onHand: 2` requesting `quantity: 99` — the cheapest way to force a rejection without depending on timing or concurrency.
