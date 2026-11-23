---
source: src/modules/delivery/tests/unit/money-reconciliation.property.test.ts
source_sha256: 6b22e4e76ee09e3b5327aa125082cf4fe158649bcbd615d28485e17104bd7323
context_sha256: 4481bc4ad06d92c461ed902f2b6b90f3149ba5bb2e7f4888f93840bbe58c584d
generated_at: 2026-11-22T05:04:52.296594+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/tests/unit/money-reconciliation.property.test.ts

## Purpose
Property-based tests (fast-check, seeded) proving that composing `orders.orderTotal` with `delivery.priceShipping` conserves money. Cart checkout, the payment intent freeze, and the confirmation email each perform this composition themselves rather than calling one another. The sibling files `totals.property.test.ts` and `money.property.test.ts` cover `orders`' functions in isolation, not this cross-module composition.

## Key elements
- `RUN` — shared fast-check config: fixed seed `20_260_902`, `numRuns: 300`, `endOnFailure: true`. It is the single place to change the seed.
- `EUR` — the currency used throughout. Currency-specific rounding is left to `money.property.test.ts`.
- `decimalPrice()` — arbitrary producing cents-precise decimal text (0 to 100,000.00, two decimals), matching `Product.price` as decimal text.
- `lineItem()` — arbitrary order line: `quantity` 0–1000 plus `product: { price }`.
- `shippingMethod()` — arbitrary picking one of `standard`, `express` or `pickup`, resolved via `findShippingMethod`.
- Test 1, "never invents or drops a cent": for up to 20 lines and any method, computes `linesTotal` with `sumLineItems(...).price`, `shippingCost` with `priceShipping`, and `total` with `orderTotal`. Asserts `toMinorUnits(total)` equals the sum of the two parts in minor units.
- Test 2, "charges exactly the lines total once a method waives shipping": with `pickup`, asserts `orderTotal(...)` is `toBe(linesTotal)`.

## Relationships
- `src/domain-primitives/money.ts` — supplies `toMinorUnits`, used to compare totals in integer minor units.
- `src/modules/orders/index.ts` — supplies `sumLineItems` and `orderTotal`. The orders module is consumed through its public entry point.
- `src/modules/orders/domain/totals.ts` — presumably where those functions are implemented. The test doesn't import it directly.
- `src/modules/delivery/domain/index.ts` — supplies `findShippingMethod` and `priceShipping`, imported via the relative path `../../domain`.
- `src/modules/delivery/domain/rates.ts` — defines the shipping rates and thresholds that `priceShipping` applies. It is not imported directly.

## Notes
- The seed is fixed, so a counterexample reproduces. Change `RUN.seed` to explore other inputs.
- `findShippingMethod(id)!` uses a non-null assertion. The comment says it is the only public way to reach a method.
- Test 2 relies on `pickup` having no free-shipping threshold and a zero rate. The comment says it is the only method that is always free.
- Test 2 uses `toBe` on the money value itself, so it expects `orderTotal` to return a value identical to `linesTotal`. Test 1 compares in minor units.
