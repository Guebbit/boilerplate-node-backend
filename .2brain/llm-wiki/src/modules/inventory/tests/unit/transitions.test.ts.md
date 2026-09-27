---
source: src/modules/inventory/tests/unit/transitions.test.ts
sha256: b5f4ac5ec07bc19f096daaa1bb1eceb7eeea35f962d4ddd0487dec42dd8e4f71
generated_at: 2026-09-27T14:57:40.396234+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/unit/transitions.test.ts

## Purpose

Unit tests for the `counterDeltaFor` transition table. Rather than asserting that the function returns what it returns, the suite pins three domain invariants: only receipts/adjustments/restocks (and commit) change unit count, commit shifts both counters equally so availability (`onHand − reserved`) is unaffected, and release/expire are exact inverses of reserve.

## Key elements

- **`EVERY_REASON`** — all values of `StockMovementReason`, used to drive exhaustive and filtered assertions.
- **`describe('counterDeltaFor', …)`** — single suite with seven `it`/`it.each` cases:
  - *Covers every reason the contract declares* — iterates all enum members to guarantee the exhaustive switch is actually exercised (catches a reason added to the contract but not the table).
  - *Signed delta per reason* (`it.each`) — pins the exact `{onHandDelta, reservedDelta}` pair for each reason, matching the literal table in `openapi.yaml:162-171`.
  - *Only sale/receipt/adjust/restock change unit count* — filters reasons with non-zero `onHandDelta` and asserts the set is exactly `[commit, receive, adjust, restock]`.
  - *Commits without changing availability* — asserts `onHandDelta === reservedDelta` so `onHand − reserved` is invariant.
  - *Release / expire are exact inverses of reserve* (`it.each`) — sums both columns to zero.
  - *Reserve/release/expire never touch onHand* — asserts `onHandDelta === 0` for all three.
  - *Adjustment carries its sign* — verifies `adjust(-3)` yields `onHandDelta: -3` (not `3`), guarding against a stray `Math.abs`.

## Relationships

- **`src/modules/inventory/domain/index.ts`** — re-exports `counterDeltaFor`, which is the sole function under test (`import { counterDeltaFor } from '../../domain'`).
- **`src/modules/inventory/domain/transitions.ts`** — implementation module behind the re-export; the test's expectations encode the table defined there.
- **`src/types/index.ts`** — source of the `StockMovementReason` enum (`import { StockMovementReason } from '@types'`), which drives every test case.

## Notes

- The authoritative source for expected deltas is `openapi.yaml:162-171` (E1), not the implementation — the tests are written to catch a table copied wrong.
- `adjust` is the **only** reason whose quantity arrives pre-signed (negative = shrinkage/write-off). A `Math.abs` in the implementation would silently turn write-offs into gains; the sign-preservation test exists specifically for that.
- `commit` legitimately has a non-zero `onHandDelta` (units physically leave); the invariant is that it *also* decrements `reserved` by the same amount, leaving availability unchanged.
- Tests are pure: no mocks, no database, no async.
