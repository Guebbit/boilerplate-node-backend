---
source: src/modules/orders/tests/unit/tax.test.ts
sha256: 85bd9881f430c04021d3c66fcedc04d446a591021e09a0a5ba81e8b039858bba
generated_at: 2026-11-08T07:14:49.579926+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/tax.test.ts

## Purpose

Unit tests for the `orderTaxBreakdown` pure function (and its `TaxableLineItem` input shape) from the orders domain. The suite verifies VAT extraction from gross line totals, per-line rounding semantics, shipping apportionment rules (physical-vs-digital, pro-rata by gross value), order-level aggregation, and currency-specific minor-unit exponents. It exists to pin the exact cent-level arithmetic that downstream invoice rendering and reconciliation depend on.

## Key elements

- **`line(price, quantity, taxRate)`** — factory returning a `TaxableLineItem` shaped as raw aggregate output (physical line).
- **`digitalLine(price, quantity, taxRate)`** — same shape but with `requiresShipping: false`; used to verify shipping is never apportioned onto digital goods.
- **`describe('orderTaxBreakdown — an order with no lines')`** — zero-order baseline.
- **`describe('orderTaxBreakdown — a fully-VAT order')`** — core VAT extraction, line-total (not unit) taxation, zero-rate, cross-line summation, net+tax=gross invariant, non-negativity.
- **`describe('orderTaxBreakdown — shipping, apportioned pro-rata by line value')`** — shipping tax folding, per-line rate application to shipping shares, digital-line exclusion, digital-only orders.
- **`describe('orderTaxBreakdown — shippingNetAmount/shippingTaxAmount')`** — shipping sub-totals, `shippingByRate` row splitting, per-rate gross reconstruction.
- **`describe('orderTaxBreakdown — taxSummary, one row per distinct rate')`** — rate-grouped summary rows, merge behavior.
- **Final describe block (truncated)** — minor-unit exponent edge cases: JPY (0 dp) and KWD (3 dp) against the same basket.

## Relationships

- **`src/modules/orders/domain/tax.ts`** — the sole production dependency. The test file imports `orderTaxBreakdown`, `lineTaxFromRateTotals`, and the `TaxableLineItem` type from this module. Every assertion in this file validates the contract of those exports; a change in `tax.ts` arithmetic or return shape will surface here as a failing expectation.

## Notes

- All monetary assertions use **exact string equality** (e.g. `'3.59'`) for line-level values and **`toBeCloseTo(..., 6)`** for cross-line sums — the distinction matters when debugging rounding drift.
- Expected cent values are **hand-computed in comments** (e.g. `round(1990 × 0.22/1.22) = 359`) rather than derived by a helper; when updating arithmetic in `tax.ts`, the comments must be re-verified independently.
- Per-line rounding is **not linear in quantity**: a 2-unit line at 20% does not equal 2 × the 1-unit tax. This is intentional and tested explicitly.
- Shipping is apportioned **only across physical lines**; a digital line on the same order receives zero shipping share, and a digital-only order absorbs no shipping at all.
- The test file assumes EUR (2 dp) throughout except the final describe block, which exercises the currency's own minor-unit exponent (JPY 0 dp, KWD 3 dp).
- Comments reference `money.ts` for the float-precision rounding strategy; changes there can silently shift the "known float-imprecise" values locked in here.
