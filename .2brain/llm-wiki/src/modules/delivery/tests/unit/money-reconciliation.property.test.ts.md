---
source: src/modules/delivery/tests/unit/money-reconciliation.property.test.ts
sha256: 9f4e514df0ffc32a26cfdd53bf7efd49fe47ae0ab13eae72d2053e6f2a0e12f1
generated_at: 2026-11-08T05:46:19.528815+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/unit/money-reconciliation.property.test.ts

## Purpose

Property-based test that proves the **composition** of `orderTotal` (orders) and `priceShipping` (delivery) preserves money invariants — the exact arithmetic every caller (cart checkout, payment-intent freeze, confirmation email) performs independently. Neither `totals.property.test.ts` nor `money.property.test.ts` covers this cross-module combination; this file fills that gap so a regression in either side's rounding or summation surfaces as a single, reproducible counterexample.

## Key elements

- **`RUN`** — shared `fast-check` config: seed `20_260_902`, 300 runs, `endOnFailure`. Single point to change seed or run count.
- **`EUR`** — currency constant; the file tests one currency's composition, not currency-agnostic behaviour.
- **`decimalPrice()`** — arbitrary that produces a cents-precise decimal string (e.g. `"1234.56"`), matching the `Product.price` shape.
- **`lineItem()`** — arbitrary for one order line: `{ quantity: 0–1000, product: { price } }`.
- **`shippingMethod()`** — picks one of the three valid IDs (`standard`, `express`, `pickup`) and resolves it via `findShippingMethod`.
- **Test 1: "never invents or drops a cent"** — asserts `toMinorUnits(orderTotal) === toMinorUnits(linesTotal) + toMinorUnits(shippingCost)` for random line arrays and any method.
- **Test 2: "charges exactly the lines total once a method waives shipping"** — asserts that with `pickup` (zero rate, no threshold) the computed total is reference-equal to `linesTotal` alone.

## Relationships

- **`src/domain-primitives/money.ts`** — imports `toMinorUnits`, the sole bridge that lets the assertion compare monetary values in integer cents.
- **`src/modules/orders/index.ts`** (barrel) — imports `sumLineItems` and `orderTotal`.
- **`src/modules/orders/domain/totals.ts`** — the implementation behind those two functions; the test's left-hand side of the composition.
- **`src/modules/delivery/domain/index.ts`** — re-exports `findShippingMethod` and `priceShipping`; the test's right-hand side of the composition.
- **`src/modules/delivery/domain/rates.ts`** — where the per-method rates and thresholds consumed by `priceShipping` are defined; changes here directly alter what Test 1 and Test 2 exercise.

## Notes

- The file is **seeded**; a failing CI run reproduces the same 300 inputs. Change `RUN.seed` to explore a new space.
- The doc-comment header explicitly delegates single-function proofs to `totals.property.test.ts` and `money.property.test.ts`; this file tests *only the glue* between them.
- `findShippingMethod(id)!` uses a non-null assertion — the test assumes the three IDs are always registered. If a method is ever removed, the test will throw rather than produce a meaningful counterexample.
- Conventions and rationale for the "one shared property" approach are documented in `docs/tools/property-testing.md`.
