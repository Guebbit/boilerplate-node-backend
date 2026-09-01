# src/modules/orders/tests/unit/totals.property.test.ts

## Purpose

Property-based tests for the order-total arithmetic in `domain/totals.ts`. Guarantees that `sumLineItems` and `orderTotal` are total (never NaN, never throw) even against hostile or nullish input, and that their numeric results satisfy exact arithmetic invariants (additivity, scaling, order-independence) at cent precision.

## Key elements

- **`RUN`** — Single `{ seed, numRuns, endOnFailure }` constant applied to every `fc.assert` call. Change the seed in one place.
- **`nullish()`** — Arbitrary yielding `null` or `undefined`, modelling both spellings a failed product-populate can leave behind.
- **`lineItem()`** — Arbitrary for a well-formed `LineItem` (integer quantity 0–1000, integer price 0–100 000).
- **`hostileLineItem()`** — Arbitrary for maximally malformed `LineItem`s (wrong types, missing keys, nullish fields). Cast to `fc.Arbitrary<LineItem>`.
- **`describe('sumLineItems — totality')`** — Asserts no NaN, no throw, and correct `count` for arbitrary hostile input.
- **`describe('sumLineItems — arithmetic invariants')`** — Zero-on-empty, order-independence, non-negativity, additivity over concatenation (compared in cents), quantity-scaling, and zero-quantity line handling.
- **`describe('orderTotal')`** — Verifies `orderTotal` equals the line total when shipping is absent/zero, adds shipping exactly in cents, and never returns NaN.

## Relationships

- **`src/modules/orders/domain/totals.ts`** — Source under test. This file imports `sumLineItems`, `orderTotal`, and the `LineItem` type from there. Every property asserts behaviour of those three exports.

## Notes

- All money comparisons go through `Math.round(x * 100)` before equality; the division back to dollars is the only imprecision, so raw float `===` is never used for price.
- `hostileLineItem` uses `requiredKeys: []` so *every* field is optional—this is intentional to simulate a fully missing populate, not a typo.
- The `nullish()` helper exists to prevent a lint migration to `undefined`-only from silently dropping the `null` path; both must be exercised.
- Seeded with a fixed value (`20_260_809`); a failure reproduces as a plain `it()` counterexample rather than a one-off flake.
