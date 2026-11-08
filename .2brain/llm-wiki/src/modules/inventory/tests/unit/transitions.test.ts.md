---
source: src/modules/inventory/tests/unit/transitions.test.ts
sha256: af88e22b9f8c17c0753fa876975b5b97179031495ef549d891530739ff1ab065
generated_at: 2026-11-08T06:09:09.718070+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/unit/transitions.test.ts

## Purpose

Unit tests for the `counterDeltaFor` transition table. Rather than asserting "the function returns what it returns," the suite pins three structural invariants of stock accounting: which reasons actually change unit counts, that a shipment is availability-neutral, and that reserve/release/expire are exact inverses. No mocks, no database.

## Key elements

- **Exhaustiveness test** – iterates every `StockMovementReason` value through `counterDeltaFor` to guarantee the exhaustive `switch` has no uncovered branch at compile time.
- **Signed-delta table test (`it.each`)** – locks the exact `{onHandDelta, reservedDelta, backorderedDelta}` for each reason at quantity 3, matching the signed table in `openapi.yaml`.
- **On-hand change filter test** – asserts only `ship`, `receive`, `adjust`, `restock` produce a non-zero `onHandDelta`.
- **Ship availability test** – verifies `onHandDelta === reservedDelta` for `ship`, so `onHand − reserved` is untouched.
- **Reserve-inverse test (`it.each`)** – confirms `release` and `expire` exactly cancel a `reserve` on both `onHand` and `reserved`.
- **Reserve-family on-hand zero test** – asserts `onHandDelta === 0` for `reserve`, `release`, `expire`.
- **Adjust sign test** – passes a negative quantity and expects a negative `onHandDelta`, guarding against an accidental `Math.abs`.
- **Backorder round-trip test** – calls `counterDeltaFor(reason, qty, 'backorder')` (three-arg form) to show `release`/`expire` reverse a backorder claim without touching the shelf.
- **Allocate test** – verifies `reservedDelta === −backorderedDelta` and `onHandDelta === 0`, i.e. an allocation is a pure internal counter swap.

## Relationships

- **`src/modules/inventory/domain/transitions.ts`** – defines `counterDeltaFor`, the function under test.
- **`src/modules/inventory/domain/index.ts`** – barrel re-export; the test imports `counterDeltaFor` through `../../domain`, which resolves to this file.
- **`src/types/index.ts`** – source of the `StockMovementReason` enum; the test iterates `Object.values(StockMovementReason)` for exhaustiveness.

## Notes

- The backorder inverse test calls `counterDeltaFor` with a **third argument** (`'backorder'`), a context overload not exercised by the other tests.
- The exhaustiveness loop is load-bearing: without it, a new enum member that is handled in the `switch` but never *called* with would not fail compilation here.
- The `adjust` sign test exists specifically because a `Math.abs` regression would be semantically silent (turning write-offs into gains) yet pass every other assertion.
