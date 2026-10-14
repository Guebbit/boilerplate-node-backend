---
source: src/modules/inventory/tests/unit/transitions.test.ts
sha256: e30c5eec0d59b92d291df481ea71f0c1ceacfe9d164f961a9f42669f98ca7eeb
generated_at: 2026-10-14T16:04:44.359753+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/unit/transitions.test.ts

## Purpose

Pure unit tests for the `counterDeltaFor` transition table. Rather than asserting individual return values in isolation, the suite pins three structural invariants of the inventory model: (1) only receipt/adjust/restock/ship change the physical unit count, (2) ship decrements `onHand` and `reserved` in lockstep so availability is unaffected, and (3) release/expire are exact inverses of reserve. The goal is to catch a table copied with wrong signs or magnitudes, not to restate the table.

## Key elements

- **`EVERY_REASON`** — `Object.values(StockMovementReason)`, used to drive exhaustive and invariant checks across all declared reasons.
- **"covers every reason the contract declares"** — iterates every enum value through `counterDeltaFor`, guaranteeing the exhaustive switch is exercised for each member (catches a new enum value added to the type but missing from the table).
- **`it.each` — contract-documented signed delta** — pins the exact `{ onHandDelta, reservedDelta, preorderedDelta }` triple for all nine reasons, acting as a literal reference table.
- **"lets only a shipment, a receipt, an adjustment or a restock change how many units exist"** — filters to reasons where `onHandDelta !== 0` and asserts the set is exactly `{ship, receive, adjust, restock}`.
- **"ships without changing availability"** — asserts `onHandDelta === reservedDelta` for `ship`, so `onHand − reserved` is unchanged.
- **"makes %s the exact inverse of a reserve"** (`release`, `expire`) — sums the reserve delta and the undoing delta per counter and expects zero.
- **"never lets a reserve or a release touch what exists"** — asserts `onHandDelta === 0` for `reserve`, `release`, `expire`.
- **"carries an adjustment's sign rather than its magnitude"** — passes `-3` and `+3` for `adjust` to guard against a `Math.abs` regression.
- **"moves only the allowance for a preorder claim…"** — verifies `preorder` touches only `preorderedDelta`, and that `release`/`expire` (with the `'preorder'` scope argument) reverse exactly that counter without touching shelf or reserved.
- **"turns an allocated claim into a real hold…"** — asserts `allocate` transfers from `preordered` to `reserved` with zero `onHandDelta`.

## Relationships

- **`src/modules/inventory/domain/transitions.ts`** — defines `counterDeltaFor`, the sole function under test.
- **`src/modules/inventory/domain/index.ts`** — barrel re-export through which the test imports `counterDeltaFor` (`import { counterDeltaFor } from '../../domain'`).
- **`src/types/index.ts`** — source of the `StockMovementReason` enum that enumerates every reason the table must handle.

## Notes

- The file is explicitly pure: no mocks, no database, no async. It exercises only the arithmetic table.
- The exhaustiveness test is not redundant with the TypeScript exhaustive switch — it ensures a *new* enum member added to the type actually gets a row in the table (the switch only errors if that member is ever passed, which this test guarantees).
- `adjust` is the one reason whose quantity is pre-signed by the caller; the sign-preservation test exists to prevent a `Math.abs` from silently turning write-offs into gains.
- The `preorder` reversal tests pass a third positional argument (`'preorder'`) to `counterDeltaFor`, distinguishing it from the plain `release`/`expire` case which reverses the `reserved` counter.
- The `ship` reason is intentionally included in the "changes onHand" set even though no customer action triggers it — the comment notes it represents dispatch, not sale.
