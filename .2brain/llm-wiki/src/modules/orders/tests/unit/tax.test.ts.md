---
source: src/modules/orders/tests/unit/tax.test.ts
sha256: 4a2dc7111778414dac3f2e52d0f9b3b18a06bf8e118d675408c42b74f38c74ca
generated_at: 2026-09-23T19:15:39.375243+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/tax.test.ts

## Purpose

Unit tests for `orderTaxBreakdown`, the pure function that computes per-line and order-level VAT figures (net, tax, gross) from a list of taxable line items and an optional shipping cost. The tests pin down rounding behavior, shipping apportionment rules, and the internal consistency of every output field.

## Key elements

- **`line(price, quantity, taxRate)`** — local helper that shapes a minimal `TaxableLineItem` (loosely typed aggregate output) for use across all test cases.
- **`describe('…an order with no lines')`** — verifies the empty-order contract: all totals zero, arrays empty.
- **`describe('…a fully-VAT order')`** — locks in the inclusive-tax extraction formula (`round(gross × rate / (1+rate))`), per-line (not per-unit) rounding, zero-rate behavior, cross-line summation, net+tax=gross invariant, and non-negativity.
- **`describe('…shipping, apportioned pro-rata by line value')`** — confirms shipping's own tax is added to `taxTotal` only (line-level `taxAmount`/`netAmount` are untouched), apportioned by each line's gross value at that line's own rate, and that `undefined`/`0` shipping are equivalent.
- **`describe('…shippingNetAmount/shippingTaxAmount')`** — checks the per-rate breakdown (`shippingByRate`) sums to the order-level shipping fields and reconstructs the shipping gross to the cent.
- **`describe('…taxSummary, one row per distinct rate')`** — verifies same-rate merging, ascending sort, shipping's share folded into the correct rate row, per-row gross=net+tax, reconciliation against `netTotal`+`shippingNetAmount` / `taxTotal`, and that summed gross equals the customer's total charge.

## Relationships

- **Imports** `orderTaxBreakdown` (function under test) and the `TaxableLineItem` type from `src/modules/orders/domain/tax.ts`. All assertions call the imported function directly; no mocking or other modules are involved.

## Notes

- Floating-point comparisons use `toBeCloseTo(…, 6)` or explicit cent-rounding (`Math.round(x * 100)`) rather than strict equality, because the implementation operates in decimal-integer (cents) internally but returns float dollars.
- Tax is extracted from the **gross-inclusive** line total, not the unit price: the formula is `round(gross × rate / (1 + rate))`. Tests include a hand-computed 19.90 × 1 @ 22 % case (→ 3.59 / 16.31) to guard against float-imprecise multiply regressions.
- Per-line rounding is **not** linear in quantity; the 10 × 2 @ 20 % case (→ 3.33, not 2 × 3.30) is a deliberate invariant.
- `taxSummary` rows include the apportioned shipping share; `shippingByRate` rows do not overlap with line-level amounts. Both must independently reconcile to the grand totals.
