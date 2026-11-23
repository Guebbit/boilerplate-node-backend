---
source: src/modules/orders/tests/unit/tax.test.ts
source_sha256: 999f09b9bb011779545df5b375b2afffb663473d82dd3d822ea67fb586851947
context_sha256: f55a121754e31a091fbc7a6f3962daf2e8504400a1d558df7cd3732187f91378
generated_at: 2026-11-22T06:38:46.009237+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/tests/unit/tax.test.ts

## Purpose
Unit tests for `orderTaxBreakdown` in `src/modules/orders/domain/tax.ts`, the pure arithmetic behind an order's VAT figures. Frozen `price` and `taxRate` go in, and per-line and order-level amounts come out. Cases price in EUR (2 decimals) unless a case is about a currency's own minor-unit exponent. A describe block at the end covers JPY (0 decimals) and KWD (3 decimals) against the same basket.

## Key elements
- `line(price, quantity, taxRate)`: helper that builds a `TaxableLineItem` shaped like raw aggregate output (`{ quantity, product: { price, taxRate } }`).
- `digitalLine(...)`: same, but with `requiresShipping: false`, so the line gets no shipping apportionment.
- `describe` blocks, each calling `orderTaxBreakdown({ items, currency, shippingCost? })`:
  - **No lines**: returns zero strings (`'0.00'`) on every amount axis and empty `lines`, `taxSummary` and `shippingByRate`.
  - **Fully-VAT order**:
    - Tax is extracted from the gross line total (price × quantity), not from the unit price alone.
    - A zero rate charges nothing.
    - Order totals sum the lines.
    - Each line's net plus tax reconstructs its gross to the cent.
    - Amounts are never negative.
    - Expected values are hand-checked, e.g. a 19.90 unit price at 22% gives tax `3.59` and net `16.31`.
  - **Shipping, apportioned pro-rata by line value**:
    - Shipping's tax is added to `taxTotal` only. Each line's own `taxAmount` and `netAmount` stay unchanged.
    - Each line's share is taxed at that line's own rate.
    - A missing `shippingCost` gives the same result as `'0.00'`.
    - Shipping is spread over physical lines only, never onto digital ones.
    - A digital-only order apportions nothing.
  - **`shippingNetAmount` / `shippingTaxAmount`**:
    - Both are zero when there is no delivery method.
    - `shippingByRate` is empty when there is no shipping cost.
    - `shippingByRate` has one row per rate that received a share.
    - Rows sum to the order-level shipping net and tax.
    - Net plus tax reconstructs the shipping gross to the cent.
  - **`taxSummary`**: one row per distinct rate (`{ rate, netAmount, taxAmount, grossAmount }`). The visible tests include a single zero-rate line producing one row with the line's full amount as net.

## Relationships
- Imports `orderTaxBreakdown`, `lineTaxFromRateTotals` and the `TaxableLineItem` type from `src/modules/orders/domain/tax.ts`, the only module under test. Everything here exercises that file's public API.

## Notes
- Expected outputs are money amounts as fixed-decimal strings (`'3.59'`). Many assertions convert with `Number(...)` and compare to the cent via `Math.round(x * 100)` or `toBeCloseTo`.
- Tax is rounded once per line, not per unit, so line tax is not exactly linear in quantity. For example, 10 × 2 at 20% gives `3.33`.
- Tests use the globals `describe`, `it` and `expect` with no import, so the test runner provides them.
- The `shippingByRate` rows are asserted in ascending rate order (`[0.1, 0.22]`).
