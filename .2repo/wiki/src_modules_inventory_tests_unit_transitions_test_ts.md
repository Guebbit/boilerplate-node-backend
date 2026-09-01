# src/modules/inventory/tests/unit/transitions.test.ts

## Purpose

Unit tests for the inventory transition table. Rather than asserting "output equals input," the suite pins down three invariants: only receipt or adjustment changes the unit count, a commit shifts both counters equally so availability is untouched, and reserve / release / expire are exact inverses. No mocks, no database—pure function calls.

## Key elements

- **`counterDeltaFor` block** — asserts exhaustiveness over every `StockMovementReason` value, that only `commit`/`receive`/`adjust` touch `onHand`, that commit deltas are equal on both counters, that `reserve` + `release`/`expire` sum to zero on both counters, that `reserve`/`release`/`expire` never alter `onHand`, and that `adjust` preserves sign (−3 stays −3).
- **`availabilityOf` block** — table-driven checks that `onHand − reserved` is the result, that absent counters read as 0 (not Infinity), and that a negative result is clamped to 0.
- **`EVERY_REASON`** — `Object.values(StockMovementReason)`, used to drive the exhaustiveness and filtering loops.

## Relationships

- **`src/modules/inventory/domain/index.ts`** — re-exports `counterDeltaFor` and `availabilityOf`, which are the two functions under test (imported via `../../domain`).
- **`src/modules/inventory/domain/transitions.ts`** — defines the actual transition table and the exhaustive switch that `counterDeltaFor` implements; these tests are the behavioral contract for that module.
- **`src/types/index.ts`** — source of the `StockMovementReason` enum; the exhaustiveness test iterates its values to ensure the table stays in lockstep with the contract.

## Notes

- The exhaustiveness test is load-bearing: `counterDeltaFor` switches over the enum, so a new reason added to `StockMovementReason` without a table entry is only a compile error if *something* passes that value in. This test is that something.
- The `adjust` sign test exists to catch an accidental `Math.abs` that would turn write-offs into phantom stock.
- `availabilityOf` treats missing counters as 0 deliberately—the safe default when the number gates a charge.
- The negative-clamp case (`onHand: 3, reserved: 8`) is expected to be unreachable given upstream guards, but is asserted to keep it from ever reaching a UI.
