---
source: src/modules/orders/tests/unit/totals.property.test.ts
source_sha256: 9e78e1bd6412968e217eef872f6c9f7ab67a9eb99ab7765bbdb891fb198891fe
context_sha256: 6476660586e87cbcbc50f2080a80a2478a1a71b7544bae0f5f2a375ee06f43e0
generated_at: 2026-11-22T06:39:04.396660+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/tests/unit/totals.property.test.ts

## Purpose
Property-based tests (fast-check, seeded) for `sumLineItems` and `orderTotal` in `src/modules/orders/domain/totals.ts`. They check that order and cart arithmetic is total (never NaN, never throws, even on junk input from failed populates), and that additivity and scaling hold exactly in cents rather than to a float tolerance. Any counterexample found is meant to be copied back as an ordinary `it()`.

## Key elements
- `RUN` — shared fast-check config: fixed seed `20_260_809`, `numRuns: PROPERTY_RUNS`, `endOnFailure: true`.
- `EUR` — currency used by nearly all cases; the currency is not what's under test.
- `nullish()` — arbitrary yielding `null` or `undefined`; both spellings must be handled, so neither can be dropped.
- `decimalPrice()` — cents-precise decimal string price (0 to 100,000.00).
- `lineItem()` — well-formed line (quantity 0–1000, product with decimal price).
- `hostileLineItem()` — line with optional keys and junk quantity/product/price values (doubles, strings, nullish, booleans, empty records), cast to `LineItem`.
- `describe('sumLineItems — totality')` — never NaN, never throws, and `count` always equals the array length.
- `describe('sumLineItems — arithmetic invariants')` — empty cart gives `{ count: 0, quantity: 0, price: '0.00' }`; order independence; non-negativity; additivity over concatenation (exact in cents); price scales with quantity (doubling); a zero-quantity line adds nothing to the price but still adds 1 to `count`.
- `describe('orderTotal')` — equals the line total when `shippingCost` is `undefined`/`null`/`0`; adds shipping exactly in cents; never NaN on hostile input; rounds to each currency's own minor unit (EUR `24.90`, JPY `25`, KWD `24.900` for a 19.90 basket plus 5.00 shipping).

## Relationships
- `src/modules/orders/domain/totals.ts` — the unit under test (`sumLineItems`, `orderTotal`, `LineItem` type).
- `src/domain-primitives/money.ts` — `toMinorUnits` converts prices to integer minor units for exact comparisons.
- `tests/support/knobs.ts` — imported as `@tests/knobs`; supplies `PROPERTY_RUNS`, the run count (env `TEST_PROPERTY_RUNS` per the file's comment).

## Notes
- Per-currency rounding of `sumLineItems`/`orderTotal` is delegated to `money.property.test.ts`. Only the final example-based `orderTotal` test touches non-EUR currencies.
- The "zero quantity" test passes a numeric `price` (an integer) in its extra line rather than a decimal string, and, unlike the other properties, does not pass `RUN` to `fc.assert`'s options in the visible code structure's argument position the same way... — see the call: `RUN` is passed as the final argument, so it is seeded like the rest.
- The shipping test passes `shippingCost` as whole-unit integers and multiplies by 100 to get cents.
