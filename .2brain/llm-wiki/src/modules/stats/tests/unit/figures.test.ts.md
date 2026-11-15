---
source: src/modules/stats/tests/unit/figures.test.ts
sha256: 71462df6f4a86b677782481ce233f37f28e70caeb1793dee71b47d67468afe71
generated_at: 2026-11-14T22:02:32.142629+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stats/tests/unit/figures.test.ts

## Purpose
Unit tests for the sales-figures domain logic. They lock down three guarantees: net sales subtract reversals while shipping and VAT are charged-minus-refunded; a shop with zero orders never divides by zero; and currencies without a minor unit (e.g. JPY) are formatted correctly.

## Key elements
- **`eur(amount)`** – local helper wrapping `toMinorUnits(amount, 'EUR')` so fixtures can be written in whole-unit terms.
- **`describe('figuresOf', …)`** – the main test block. Verifies the full breakdown (net sales, shipping, taxes, AOV, etc.) from a two-order fixture with a credit note, the zero-order guard, and JPY formatting.
- **`describe('addRawFigures', …)`** – confirms that summing two buckets field-by-field produces the combined whole.
- **`describe('rateOf', …)`** – checks the simple share calculation and the `0 / 0 → 0` guard.

## Relationships
- **`src/modules/stats/domain/figures.ts`** – the unit under test. Provides `figuresOf`, `addRawFigures`, `emptyRawFigures`, and `rateOf`.
- **`src/domain-primitives/money.ts`** – supplies `toMinorUnits`, used by the `eur` helper and directly in the JPY test to build minor-unit fixtures.

## Notes
- The main `figuresOf` assertion uses `toEqual` (exact shape), while the zero-order and `addRawFigures` tests use `toMatchObject` (partial). If you extend the raw-figures record, the partial-match tests won't break on new fields, but the full-match one will.
- The JPY case (`1000 JPY / 3 orders → '333'`) specifically guards against appending `.00` to a currency that has no subunit.
- All monetary values in the fixture are built via `toMinorUnits`; there is no floating-point arithmetic in the test itself.
