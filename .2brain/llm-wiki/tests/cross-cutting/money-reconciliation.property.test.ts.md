---
source: tests/cross-cutting/money-reconciliation.property.test.ts
sha256: 4c49a9a7f6d40e917e1fbf767143809d3877079fbc33986d9e7cbebf91e29ef6
generated_at: 2026-09-23T19:57:47.292602+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/money-reconciliation.property.test.ts

## Purpose

Property-based test proving that the composition of `orders.orderTotal` and `delivery.priceShipping` preserves money invariants — i.e. `total = lines + shipping` down to the cent, and free-shipping methods add nothing. Each module has its own isolated property test; this file fills the gap by exercising the two functions together the way checkout, payment freeze, and the confirmation email each do independently.

## Key elements

- **`RUN`** – Single seed (20_260_902), 300 runs, stop-on-failure. Change the seed here, not per-test.
- **`decimalPrice()`** – Generator for `Product.price`-shaped values: integers 0–10 000 000 mapped to `cents / 100`, so the price is a dollar float with cent precision.
- **`lineItem()`** – Generator for one order line (`{ quantity, product: { price } }`) as consumed by `sumLineItems`.
- **`shippingMethod()`** – Picks one of `'standard' | 'express' | 'pickup'` and resolves it through the public `findShippingMethod` accessor.
- **`it('never invents or drops a cent…')`** – Asserts `round(total×100) === round(lines×100) + round(shipping×100)` for up to 20 random lines × any method.
- **`it('charges exactly the lines total once a method waives shipping…')`** – Pins the `pickup` (zero-rate, no-threshold) method and asserts `orderTotal` equals `linesTotal` exactly.

## Relationships

- **`src/modules/orders/index.ts` → `domain/totals.ts`** – Imports `sumLineItems` and `orderTotal`; these are the two functions under composition test.
- **`src/modules/delivery/index.ts` → `domain/rates.ts`** – Imports `findShippingMethod` (the sole public resolver for a rate row) and `priceShipping` (the per-order shipping cost calculation).

The file sits at the seam between the `orders` and `delivery` modules; it does not import from `src/modules/cart` or any other consumer.

## Notes

- **Seeded determinism:** the single `RUN` constant is the only place to change the seed. A failing run can be reproduced with the same seed without altering test logic.
- **Cent rounding:** both sides of the main assertion are rounded to whole cents before comparison, acknowledging that `orderTotal` may perform its own float arithmetic internally. The test tolerises representation drift but not a lost/gained cent.
- **`findShippingMethod` is the entry point:** the test never constructs a rate object directly; it relies on the module's public resolver, mirroring how production callers obtain a method.
- **`pickup` is the only guaranteed-free method** in the catalogue per the inline comment; the second test hard-codes that assumption. If the shop adds another zero-rate method, the test will not cover it unless updated.
- Referenced sibling docs: `docs/tools/property-testing.md` explains the "money invariants as one shared property" principle that motivates this file's existence.
