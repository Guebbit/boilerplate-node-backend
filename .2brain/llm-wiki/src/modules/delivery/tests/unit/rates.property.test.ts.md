---
source: src/modules/delivery/tests/unit/rates.property.test.ts
source_sha256: f8af0b12f16913065b31a50416a77c08dd8ee6c177c789c591eaa4413878a0b2
context_sha256: 1e8aab05453b4fe3f4d771b7939cf3142c44e7c89fa28ce70de39d11db3890db
generated_at: 2026-11-22T05:05:16.363712+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/tests/unit/rates.property.test.ts

## Purpose
Property-based tests (fast-check) for the shipping-rate logic in `src/modules/delivery/domain/rates.ts`. The companion `rates.test.ts` checks `priceShipping` at three fixed points; this file checks the free-shipping threshold boundary and related invariants across generated inputs. Runs are seeded so counterexamples reproduce, and any counterexample found is meant to be added back as an example in `rates.test.ts`.

## Key elements
- `RUN`: shared fast-check options with a fixed seed (`20_260_902`), `numRuns` from `PROPERTY_RUNS`, and `endOnFailure: true`. Passed to every `fc.assert` except... all of them in the `priceShipping` suites; the `methodFitsWeight` test also uses it.
- `itemsTotal()`: arbitrary generating integer cents from 0 to 1e8, converted to a EUR decimal string via `toDecimalString`.
- `priceShipping — totality`:
  - For every method in `SHIPPING_METHODS` and any total, the price is never NaN and never negative.
  - The price is never above the method's own flat rate (`method.price`).
- `priceShipping — the free-shipping threshold`, using the `standard` method (via `findShippingMethod`) and its `freeAbove`:
  - At or above the threshold (up to 1e6 cents above) the price is `'0.00'`.
  - Strictly below the threshold (1 to 1e4 cents below) the price equals `standard.price`.
  - The `express` method, which has no threshold, is always charged `express.price` at any total.
- `methodFitsWeight — the declared range holds both ways`: for any method and integer weight 0 to 1e6, `methodFitsWeight` returns true exactly when the weight is not below `minWeight` and not above `maxWeight`. An undefined bound is treated as unbounded.

## Relationships
- `src/modules/delivery/domain/rates.ts`: the code under test (`findShippingMethod`, `priceShipping`, `methodFitsWeight`, `SHIPPING_METHODS`).
- `src/domain-primitives/money.ts`: provides `toDecimalString`, `toMinorUnits` and the `Money` type. They convert between cents and decimal strings and compute the threshold in minor units.
- `tests/support/knobs.ts` (imported as `@tests/knobs`): supplies `PROPERTY_RUNS`, the run count that `RUN` uses (the comment ties it to `TEST_PROPERTY_RUNS`).

## Notes
- The tests use non-null assertions (`findShippingMethod('standard')!`, `standard.freeAbove!`). They assume the `standard` method exists and has a `freeAbove` threshold, and that `express` exists and has none.
- All prices are in `'EUR'`.
- To change the seed, edit `RUN`. To change the run count, use the `TEST_PROPERTY_RUNS` setting rather than editing this file.
