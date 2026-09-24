---
source: src/modules/orders/tests/unit/totals.property.test.ts
sha256: 42253ce2d8c1d2f538fb948d854764c22078c6db2c2cebd821585a1866ff3bcf
generated_at: 2026-09-23T19:15:50.403350+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/totals.property.test.ts

## Purpose

Property-based tests (via `fast-check`) for `sumLineItems` and `orderTotal`. The file's central concern is **totality**: no input—however malformed or nullish—may produce `NaN` or throw. Beyond that it pins the arithmetic invariants (order-independence, additivity, scaling) to the cent, and verifies that `orderTotal` composes line totals with shipping without drift.

## Key elements

- **`RUN`** — fixed `fast-check` run config: seed `20_260_809`, `numRuns` from `PROPERTY_RUNS`, `endOnFailure: true`. Single place to change seed or run count.
- **`nullish()`** — arbitrary yielding `null` *or* `undefined`; used to assert both spellings contribute 0 rather than `NaN`.
- **`decimalPrice()`** — cents-precise `double` (0 – 100 000.00), mirroring `Product.price`.
- **`lineItem()`** — well-formed `LineItem` record (integer quantity, decimal price).
- **`hostileLineItem()`** — deliberately broken `LineItem`: wrong types, nullish fields, missing keys. Cast to `fc.Arbitrary<LineItem>`.
- **`describe('sumLineItems — totality')`** — three properties: never `NaN`, never throws, `count` equals array length for *any* input.
- **`describe('sumLineItems — arithmetic invariants')`** — empty-cart zero, order-independence, non-negativity, additivity over concatenation (compared via `Math.round(… * 100)`), price scales linearly with quantity, zero-quantity line excluded from money but included in count.
- **`describe('orderTotal')`** — equals line price when shipping is absent/zero (covers `undefined`, `null`, `0`); adds shipping exactly in cents; never `NaN` with hostile items *and* hostile shipping cost.

## Relationships

- **`src/modules/orders/domain/totals.ts`** — System under test. This file imports `sumLineItems`, `orderTotal`, and the `LineItem` type. Every property here constrains the behaviour that file must satisfy.
- **`tests/support/knobs.ts`** — Supplies `PROPERTY_RUNS`, the shared run-count knob. Changing it here adjusts the iteration budget for this file (and every other property test that reads the same constant).

## Notes

- All money comparisons go through `Math.round(… * 100)` to sidestep IEEE-754 accumulation error (`0.1 + 0.2 ≠ 0.3`). The test suite never uses `toBeCloseTo` or a tolerance.
- `hostileLineItem` uses `requiredKeys: []`, so *every* field is optional in the generated record; the cast to `LineItem` is intentional and unchecked at the type level.
- `endOnFailure: true` means the suite stops at the first counterexample; the fixed seed makes that counterexample reproducible and (per the module doc-block) intended to be written back as a plain `it()`.
- The seed and run count are deliberately in one `const` (`RUN`) so a future developer changes them in one place rather than hunting through every `fc.assert` call.
