# src/modules/inventory/tests/unit/transitions.test.ts

## Purpose

Unit tests for the inventory transition table (`counterDeltaFor`) and the derived `availabilityOf` helper. Rather than restating the table, the tests assert three invariants: (1) only `receive` or `adjust` changes the total unit count, (2) `commit` moves both counters equally so a sale doesn't alter availability, and (3) `release`/`expire` are exact inverses of `reserve`.

## Key elements

- **`EVERY_REASON`** — `Object.values(StockMovementReason)`; iterated to guarantee exhaustive coverage of every reason in the contract.
- **`describe('counterDeltaFor')`** — suite covering: exhaustive switch hit, exact signed delta per reason (pinned to the OpenAPI table), the "only receipt/adjustment changes onHand" invariant, commit-doesn't-change-availability, reserve/release/expire inverse relationship, and `adjust` sign preservation.
- **`describe('availabilityOf')`** — suite covering: correct subtraction for known counter pairs, absent-field defaults (reads as 0, not unlimited), and clamping a would-be negative result to zero.

## Relationships

- **`src/modules/inventory/domain/transitions.ts`** — defines `counterDeltaFor` and `availabilityOf`, the two functions under test.
- **`src/modules/inventory/domain/index.ts`** — barrel re-export through which this file imports the two functions (`import { counterDeltaFor, availabilityOf } from '../../domain'`).
- **`src/types/index.ts`** — source of the `StockMovementReason` enum used to enumerate every movement type and to reference individual reasons in the `it.each` cases.

## Notes

- The exact-delta test case references `openapi.yaml:162-171` as the normative source for the signed table; if that spec changes, this test must change in lockstep.
- `availabilityOf({})` → `0` is deliberate: an absent counter means "nothing to sell," which is the safe default when the number gates a payment.
- `adjust` is the only reason whose quantity is pre-signed; a `Math.abs` on that path would silently convert write-offs into stock additions.
- Uses `Array.prototype.toSorted()` (non-mutating), so the `StockMovementReason` enum ordering in the expected array is independent of the iteration order of `EVERY_REASON`.
