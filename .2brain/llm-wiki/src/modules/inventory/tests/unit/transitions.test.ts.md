---
source: src/modules/inventory/tests/unit/transitions.test.ts
sha256: 090f220f1a5bfce1bb7526b8b3fc4c0794328889270b5389756c6c66aebfebc7
generated_at: 2026-10-29T04:09:46.506731+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/unit/transitions.test.ts

## Purpose

Pure unit tests for the `counterDeltaFor` transition table. Rather than restating the table, the tests assert three invariants: (1) only receipt/adjust/restock/ship change on-hand count, (2) ship moves both on-hand and reserved equally so availability (`onHand − reserved`) is untouched, and (3) reserve is exactly reversed by release or expire. No mocks, no database.

## Key elements

- **`EVERY_REASON`** — `Object.values(StockMovementReason)`; iterated to guarantee exhaustive coverage of every reason in the contract.
- **`counterDeltaFor(reason, quantity)`** — the sole function under test (imported from the domain barrel). Returns `{ onHandDelta, reservedDelta, backorderedDelta }` for a given movement.
- **Exhaustiveness test** — calls `counterDeltaFor` with every `StockMovementReason` value to trigger the exhaustive `switch` at compile time.
- **Signed-delta table test** (`it.each`) — pins the exact numeric delta per reason, matching the values documented in `openapi.yaml`.
- **Invariant tests** — filter which reasons change on-hand, verify ship's equal-column property, verify reserve/release and reserve/expire are additive inverses, confirm reserve/release/expire never touch on-hand.
- **Adjust sign test** — asserts a negative quantity produces a negative `onHandDelta` (guards against an accidental `Math.abs`).
- **Backorder/allocate tests** — verifies `backorder` only touches `backorderedDelta`, that release/expire with a `'backorder'` context reverses it, and that `allocate` converts backordered→reserved without changing on-hand.

## Relationships

- **`src/modules/inventory/domain/transitions.ts`** — defines `counterDeltaFor`, the function every test targets.
- **`src/modules/inventory/domain/index.ts`** — barrel re-export from which the test imports `counterDeltaFor`.
- **`src/types/index.ts`** — source of the `StockMovementReason` enum used throughout.

## Notes

- `counterDeltaFor` accepts an optional third argument (context, e.g. `'backorder'`) that changes the delta for `release`/`expire`. The backorder test passes `'backorder'` explicitly; other tests omit it.
- The adjust test is the only one that passes a *negative* quantity. All other tests use positive quantities; the function is expected to carry the sign of `quantity` through for `adjust` but not to negate it elsewhere.
- Tests use `Array.prototype.toSorted` (non-mutating) for order-independent comparisons of the "changes on-hand" list.
