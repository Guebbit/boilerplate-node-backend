---
source: src/modules/stats/tests/unit/figures.test.ts
source_sha256: 324767e4e2e8426f1c31c51f6bb0e599a32cb6e83ebc3e545178f1b95b5dbb1b
context_sha256: 32142c86456ee45ba5e463de6f7a6e063592c608873efdf5233c53ff3edf5553
generated_at: 2026-11-22T07:53:01.963657+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/stats/tests/unit/figures.test.ts

## Purpose
Unit tests for the sales-figure formulas in the stats domain, run against a fixed table of raw figures. They pin three behaviours: net sales is goods minus reversals, shipping and VAT are charged minus refunded, and no division by zero happens when there are no orders.

## Key elements
- `eur` — local helper that converts a EUR amount to minor units via `toMinorUnits(amount, 'EUR')`.
- `describe('figuresOf')`:
  - Uses a fixture of 2 orders, 5 units ordered and 1 reversed. Goods invoiced are 140.00, shipping 10.00 and VAT 33.00. One credit note gives back 40.00 goods and 8.80 VAT (48.80 gross).
  - Asserts the full output: `netUnits` 4, `netSales` '100.00', `shipping` '10.00', `taxes` '24.20', `totalSales` '134.20', `refunds` '48.80', `averageOrderValue` '70.00'.
  - An empty `emptyRawFigures()` input gives zeros, including `averageOrderValue` '0.00'.
  - A zero-decimal currency (JPY, 3 orders, 1000 invoiced goods) gives `averageOrderValue` '333'.
- `describe('addRawFigures')` — adds two raw-figure objects field by field. It checks `eur(0.1) + eur(0.2)` equals `eur(0.3)` in minor units.
- `describe('rateOf')` — `rateOf(1, 4)` is `0.25`, and `rateOf(3, 0)` is `0`.

## Relationships
- `src/modules/stats/domain/figures.ts` — the code under test. It supplies `figuresOf`, `addRawFigures`, `emptyRawFigures` and `rateOf`.
- `src/domain-primitives/money.ts` — supplies `toMinorUnits`, used to build the fixtures in minor units and to handle JPY's lack of a minor unit.

## Notes
- Money values in the raw input are integers in minor units. The output figures are formatted strings, such as '140.00' for EUR and '333' for JPY.
- `discounts` is '0.00' in the main case, because the fixture has no discount fields.
