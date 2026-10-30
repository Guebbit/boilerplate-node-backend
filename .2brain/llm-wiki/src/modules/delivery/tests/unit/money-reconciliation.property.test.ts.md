---
source: src/modules/delivery/tests/unit/money-reconciliation.property.test.ts
sha256: ab5c44889957810c1b80bf2591a1b9bc45bfbb6fc98216f661392d019da6c376
generated_at: 2026-10-29T03:49:41.743532+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/unit/money-reconciliation.property.test.ts

## Purpose

Property-based test proving that the **composition** of `orders.orderTotal` and `delivery.priceShipping` preserves cent-level arithmetic — the same composition that cart checkout, payment-intent freeze, and the confirmation email each perform independently. It fills the gap left by `totals.property.test.ts` and `money.property.test.ts`, which verify each module in isolation but not their combined use.

## Key elements

- **`RUN`** — frozen config object: seed `20_260_902`, 300 runs, `endOnFailure: true`. Single place to change seed or run count.
- **`EUR`** — currency code constant; rounding rules for a specific currency are tested elsewhere.
- **`decimalPrice()`** — `fc` arbitrary producing cent-precise prices (0 – 100 000.00), reflecting `Product.price` being `format: double`.
- **`lineItem()`** — `fc` arbitrary for a single order line (`quantity` 0–1000 + embedded `product.price`).
- **`shippingMethod()`** — `fc` arbitrary restricted to the three shop methods (`standard`, `express`, `pickup`) via `findShippingMethod`.
- **Test 1** — "never invents or drops a cent": asserts `round(total × 100) === round(lines × 100) + round(shipping × 100)` for up to 20 lines × any method.
- **Test 2** — "charges exactly the lines total once a method waives shipping": with `pickup` (zero rate, no threshold), asserts `orderTotal` equals `linesTotal` exactly.

## Relationships

- **`src/modules/orders/index.ts`** — barrel import source for `sumLineItems` and `orderTotal`; the test depends on these two functions composing correctly.
- **`src/modules/orders/domain/totals.ts`** — defines `sumLineItems` (sums line prices in the given currency) and `orderTotal` (adds shipping cost to lines); both are the left side of the property.
- **`src/modules/delivery/domain/index.ts`** — re-exports `findShippingMethod` and `priceShipping`; the test imports from this barrel (`'../../domain'`).
- **`src/modules/delivery/domain/rates.ts`** — defines the shipping method catalog and rate/threshold data that `findShippingMethod` and `priceShipping` resolve; the test exercises all three methods it exposes.

## Notes

- The seed is intentionally pinned (`20_260_902`) so any counterexample is reproducible with `--seed=20_260_902`.
- The test uses `findShippingMethod(id)!` (non-null assertion) because the three IDs are hard-coded constants; it will not exercise a missing-method path.
- Currency rounding is explicitly **out of scope** here — that responsibility belongs to `money.property.test.ts`. This file only checks that the *addition* of lines + shipping doesn't shift a cent.
- `orderTotal` is called with an explicit `shippingCost` argument rather than re-deriving it internally; the test is verifying that the caller's composition matches what `orderTotal` reports, not that `orderTotal` re-computes shipping.
