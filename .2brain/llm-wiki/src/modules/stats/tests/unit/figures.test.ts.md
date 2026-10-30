---
source: src/modules/stats/tests/unit/figures.test.ts
sha256: a4315c1c6815e86efba3832880f66ca760c43d6e6519d013f1cb907426eed827
generated_at: 2026-10-29T05:57:16.568462+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stats/tests/unit/figures.test.ts

## Purpose

Unit tests for the sales-figures service. They pin down the arithmetic contracts of `figuresOf` (net sales subtract reversals; shipping and VAT are charged-minus-refunded; no division by zero orders), plus the simpler helpers `addRawFigures` and `rateOf`.

## Key elements

- **`eur(amount)`** – local helper that converts a major-unit number to EUR minor units via `toMinorUnits`. Not exported.
- **`describe('figuresOf')`** – exercises `figuresOf` with a two-order fixture (goods 140, shipping 10, VAT 33, one credit note of 48.80). Three cases:
  - Reversals subtracted from goods; shipping/VAT netted (charged − refunded).
  - Empty raw figures → all monetary fields zero, `averageOrderValue` 0 (no ÷0).
  - JPY currency (no minor unit) → `averageOrderValue` is an integer (333).
- **`describe('addRawFigures')`** – confirms field-by-field addition so that summing buckets reproduces the whole.
- **`describe('rateOf')`** – confirms simple ratio (`1/4 → 0.25`) and the zero-denominator guard (`3/0 → 0`).

## Relationships

- **`src/modules/stats/services/figures.ts`** – the module under test; this file imports `addRawFigures`, `emptyRawFigures`, `figuresOf`, and `rateOf` from it.
- **`src/domain-primitives/money.ts`** – supplies `toMinorUnits`, used both inside the `eur` helper and directly in the JPY test case.

## Notes

- The JPY assertion expects an **integer** `averageOrderValue` (333), not a float — `figuresOf` must handle currencies with zero decimal places without producing fractional minor-unit values.
- `rateOf(_, 0)` is specified to return `0`, not `NaN` or `Infinity`. Any refactoring of `rateOf` must preserve this guard.
- The fixture is intentionally small (2 orders, 1 reversal) so each subtraction/netting path is observable in a single `toEqual` snapshot; adding fields to the `figuresOf` return shape will break this assertion.
