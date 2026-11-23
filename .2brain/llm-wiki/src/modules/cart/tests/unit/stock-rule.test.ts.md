---
source: src/modules/cart/tests/unit/stock-rule.test.ts
source_sha256: 6774bde8c574399ca57a73d36af50c37a0c88b1df24c16b1acf164df88c546fc
context_sha256: a2959f0d899c7dc12abb7ca7691499f778c9e2c03fbf33c3e1cd757a147b3bb6
generated_at: 2026-11-22T04:44:01.956569+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/tests/unit/stock-rule.test.ts

## Purpose
Unit tests for `fitsStock`, the single stock rule in the cart's domain layer that checkout, the cart merge and the cart view all share. It also checks that `evaluateCheckout` gives the same verdict as `fitsStock`. The tests use no mocks and no database.

## Key elements
- `describe('fitsStock')`: the only test suite in the file.
- Table test (`it.each`) over `(quantity, available)` pairs:
  - `1` of `5` fits.
  - `5` of `5` fits (exact match).
  - `6` of `5` does not fit.
  - `1` of `0` does not fit.
  - `0` of `0` fits.
- Unknown availability test: `fitsStock(1, null)` and `fitsStock(1, undefined)` both return `false`. The test name gives the reason: the product is gone or hidden.
- Consistency test with checkout, parameterised over `available` of 0, 1, 4, 5, 6. It builds a single-line cart (`productId: 'p'`, `quantity: 5`, `product: { title: 'T', available }`) and asserts that `evaluateCheckout(...).ok` equals `fitsStock(5, available)`.

## Relationships
- Imports `evaluateCheckout` and `fitsStock` from `../../domain` (`src/modules/cart/domain/index.ts`). The index re-exports these, presumably from `rules.ts` and `stock.ts`, but the test file does not show which file defines which.
- `src/modules/cart/domain/stock.ts` and `src/modules/cart/domain/rules.ts` are the likely implementation files. The test reaches them only through the index.

## Notes
- The test imports from the domain barrel (`../../domain`) rather than the individual files, so it exercises the public domain API.
- The checkout consistency test guards against drift. If checkout stops using the shared stock rule, this test fails.
- A quantity of `0` against availability `0` counts as fitting.
