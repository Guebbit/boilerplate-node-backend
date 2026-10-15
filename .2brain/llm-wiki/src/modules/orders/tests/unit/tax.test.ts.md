---
source: src/modules/orders/tests/unit/tax.test.ts
sha256: 87b4fa8aedc9a5fb8b4314914b29c38a224e70723e797d4245b60b0757dcbb75
generated_at: 2026-10-15T11:21:32.637376+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/tax.test.ts

## Purpose

Unit tests for `orderTaxBreakdown` (and `lineTaxFromRateTotals`), the pure VAT arithmetic that turns a list of taxable line items into per-line net/tax/gross figures, order-level totals, a shipping apportionment breakdown, and a rate-grouped `taxSummary`. The file pins down exact cent-level expectations so that floating-point edge cases, pro-rata shipping splits, and currency minor-unit exponents are all contractually locked.

## Key elements

- **`line(price, quantity, taxRate)`** – helper that builds a physical `TaxableLineItem` (implicitly `requiresShipping: true`).
- **`digitalLine(price, quantity, taxRate)`** – helper that builds a `TaxableLineItem` with `requiresShipping: false`; used to verify shipping is never apportioned onto digital goods.
- **`describe("…no lines…")`** – empty-order baseline: every axis is zero, arrays are empty.
- **`describe("…fully-VAT order…")`** – core arithmetic: tax extracted from gross line total (not unit price), rounding-once-per-line semantics, zero-rate passthrough, order-level summation, net+tax = gross invariant, non-negativity.
- **`describe("…shipping, apportioned…")`** – shipping tax folded into `taxTotal`, line-level `taxAmount`/`netAmount` unchanged by shipping, pro-rata split by gross value at each line's own rate, digital lines excluded from apportionment, digital-only orders get zero shipping figures.
- **`describe("…shippingNetAmount/shippingTaxAmount…")`** – per-rate shipping rows (`shippingByRate`), their sums reconciling to order-level shipping totals, and gross reconstruction.
- **`describe("…taxSummary…")`** – grouping by distinct rate, merging same-rate lines, ascending sort, folding apportioned shipping into the correct rate row.
- **`describe("…currency minor-unit exponent…")`** (truncated) – JPY (0 dp) and KWD (3 dp) against the same basket to verify the rounding path is exponent-aware.

## Relationships

- **`src/modules/orders/domain/tax.ts`** – the sole dependency. This test file imports `orderTaxBreakdown`, `lineTaxFromRateTotals`, and the `TaxableLineItem` type, then exercises their public contracts. It does not import any other runtime module.

## Notes

- All test values are hand-computed in **cents** (×100 for EUR) to sidestep float comparison; the module docblock explicitly calls out that float-imprecise multiplies must still land on the exact expected figure (see `money.ts` for the underlying rounding helper).
- Per-line tax rounding is **not linear in quantity**: `round(gross × rate / (1+rate))` on the line total is deliberately different from `quantity × round(unit_gross × rate / (1+rate))`. The 10 × 2 @ 20 % case (3.33, not 3.34) is the canonical example.
- Shipping apportionment excludes lines with `requiresShipping: false`; if **all** lines are digital, `shippingNetAmount` and `shippingTaxAmount` are forced to zero regardless of `shippingCost`.
- The file is a `@module` (no default export, no named exports beyond the test suite itself); it has no side effects.
- The trailing currency-exponent describe block (JPY/KWD) is the only section that does **not** use EUR; expect different decimal precision in those assertions.
