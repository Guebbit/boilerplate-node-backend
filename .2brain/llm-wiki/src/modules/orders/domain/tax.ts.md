---
source: src/modules/orders/domain/tax.ts
source_sha256: 1167ad197e0be637505a9279f0b2690387bcb2690add207ecd8dcbbc3a0430cd
context_sha256: d0b047af6bb12edd98d6fdbda847573da1229a27335f72386e28942700dbe7e5
generated_at: 2026-11-22T06:13:23.726554+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/domain/tax.ts

## Purpose
Derives an order's VAT figures (tax and net amounts, per-line, per-rate, and for shipping) from its FROZEN prices and rates at serialization time, the same way `totals.ts` derives `totalPrice`. Nothing is stored and nothing is re-resolved against a product's current tax class, so a config rate change cannot restate what a past order was charged. All prices are treated as gross (VAT-inclusive).

## Key elements
- `TaxableLineItem`: minimal line shape (`quantity`, `product.price/taxRate/requiresShipping`), all `unknown` because they come from raw aggregate output.
- `LineTaxBreakdown`: per-line `taxAmount`, `netAmount` and `grossAmount` (decimal strings). `grossAmount` is computed from the `Money` values before rounding. It is not copied onto serialized order items.
- `TaxRateSummary`: one rate's `rate`, `netAmount`, `taxAmount` and `grossAmount`.
- `OrderTaxBreakdown`: result of `orderTaxBreakdown`:
  - `lines`: same order and length as the input items.
  - `netTotal`: goods only.
  - `taxTotal`: goods tax plus shipping tax.
  - `shippingNetAmount` and `shippingTaxAmount`.
  - `taxSummary`: one row per distinct rate, sorted ascending.
  - `shippingByRate`: shipping's own slice per rate, with zero-shipping rates omitted.
- `OrderTaxInput`: `items`, optional frozen `shippingCost`, and `currency`.
- `orderTaxBreakdown(input)` (exported): the main entry point.
  - It computes each line's gross with `lineGross` (imported from `./totals`).
  - It apportions shipping across shipped lines only (`isShippedItem`, imported from `./rules`), weighted by gross value.
  - It groups by rate with `groupByRate` and allocates goods tax back to lines with `allocateLineTax`.
  - It then builds the per-line breakdowns and the rate summaries.
  - The part of the function that builds the final totals is cut off in the source I was given.
- `lineTaxFromRateTotals(items, currency, goodsTaxByRate)` (exported): re-derives per-line VAT for an already-issued document from frozen per-rate goods VAT (decimal strings), without the per-line shipping it no longer carries. Net plus tax equals gross exactly.
- Internal helpers:
  - `extractTax`: `gross × rate / (1 + rate)`, rounded by `scaleMoneyByRate`. It returns `NO_MONEY` when the rate is 0 or negative.
  - `frozenRate`: coerces `product.taxRate` to a number and defaults to 0 if it is not finite.
  - `groupByRate`: sums goods and shipping gross per rate and extracts VAT once per rate. It then splits that tax between goods and shipping with `apportion`.
  - `allocateLineTax`: spreads each rate's goods tax over its lines pro-rata by gross.

## Relationships
- `src/domain-primitives/money.ts`: supplies all the arithmetic and types: `Money`, `NO_MONEY`, `addMoney`, `subtractMoney`, `apportion`, `scaleMoneyByRate`, `toMinorUnits` and `toDecimalString`.
- `src/modules/orders/model.ts`: the doc comments say `model.ts#applyOrderTax` copies the public figures onto a serialized order and does not copy per-line `grossAmount` or `shippingByRate`.
- `src/modules/invoicing/emails.ts`: the doc comments say the invoice email reads `grossAmount` straight off the breakdown. I take this to mean it consumes this file's output.
- `src/modules/invoicing/services/credit-breakdown.ts`: it likely uses `lineTaxFromRateTotals` or the breakdown for issued documents. That is an inference from the helper's purpose, not something the visible code shows.
- `src/modules/orders/domain/index.ts`: a neighbor in the graph, most likely re-exporting this file's API.
- `src/modules/orders/domain/totals.ts` and `src/modules/orders/domain/rules.ts`: these are graph neighbors, and this file imports `lineGross` from `./totals` and `isShippedItem` from `./rules`.
- `src/modules/orders/tests/unit/tax.test.ts`: the unit tests for this module.

## Notes
- **Rounding:** VAT is rounded once per rate over goods plus shipping together, following EN 16931 BR-CO-17, never as a sum of per-line rounded amounts. `apportion` then splits the rounded figure, so line taxes sum exactly to their rate's row.
- **Reconciliation:** across `taxSummary`, net is `netTotal + shippingNetAmount`, tax is `taxTotal`, and gross is the order's `totalPrice`.
- **Shipping:** it has no rate of its own and is taxed at each shipped line's rate. Digital lines get zero weight.
- **Zero-weight edge case:** if every line at a rate is priced at zero, `apportion` has no positive weight to split onto, so that rate is omitted from `shippingByRate`.
- **Defaults:** a missing or non-numeric rate is treated as 0%, so such a line gets no VAT.
