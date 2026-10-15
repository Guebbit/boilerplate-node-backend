---
source: tests/cross-cutting/money-reconciliation.property.test.ts
sha256: 1755e95070190a8902e143477e41ebd4068561730049d70a9290b68be3db4a14
generated_at: 2026-10-15T12:38:52.807807+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/money-reconciliation.property.test.ts

## Purpose

Property-based test that proves the composition of `orders.orderTotal` and `delivery.priceShipping` — the exact pipeline cart checkout, payment-intent freeze, and the confirmation email each perform independently — preserves money invariants as a single shared property. Unlike `totals.property.test.ts` and `money.property.test.ts`, which validate each module in isolation, this file guards the *glue* every caller depends on without calling the other module directly.

## Key elements

- **`RUN`** — File-level `const` fixing the seed (`20_260_902`), run count (`300`), and `endOnFailure: true`. Single place to re-seed when chasing a counterexample.
- **`EUR`** — Literal currency code used in all generated data; rounding semantics for a given currency are the job of `money.property.test.ts`, not here.
- **`decimalPrice()`** — `fc.Arbitrary` for catalog prices: integer cents (0–10 000 000) mapped to dollars, reflecting `Product.price: double`.
- **`lineItem()`** — `fc.Arbitrary` producing `{ quantity: 0–1000, product: { price } }`, the shape `orderTotal` reads.
- **`shippingMethod()`** — `fc.Arbitrary` resolving one of the three known methods (`standard`, `express`, `pickup`) via `findShippingMethod` (the only public accessor).
- **`it('never invents or drops a cent…')`** — Asserts `round(total) === round(lines) + round(shipping)` for arbitrary line arrays (≤ 20) and any shipping method.
- **`it('charges exactly the lines total once a method waives shipping')`** — Pins the `pickup` (zero-rate, no-threshold) case: `orderTotal` must equal `linesTotal` exactly.

## Relationships

- Imports `sumLineItems` and `orderTotal` from `@modules/orders` (barrel: `src/modules/orders/index.ts` → `src/modules/orders/domain/totals.ts`).
- Imports `findShippingMethod` and `priceShipping` from `@modules/delivery` (barrel: `src/modules/delivery/index.ts` → `src/modules/delivery/domain/rates.ts`).
- Composes the two modules' outputs in the order their production callers do; a regression in either file that changes the rounding or threshold logic will surface here even if each module's own property test still passes.

## Notes

- The seed in `RUN` is intentional: a failing counterexample is reproducible by re-running with the same seed. Change it only when you want a fresh hypothesis space.
- `findShippingMethod(id)!` uses a non-null assertion because the three IDs are hard-coded in `shippingMethod()`; if a new method is added to the domain, this Arbitrary will *not* pick it up automatically.
- The test does **not** validate per-currency rounding rules (e.g., half-up vs. banker's); that is deliberately out of scope and covered by the money-module property test.
