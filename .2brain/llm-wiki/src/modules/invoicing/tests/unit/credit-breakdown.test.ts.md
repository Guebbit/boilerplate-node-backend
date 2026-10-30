---
source: src/modules/invoicing/tests/unit/credit-breakdown.test.ts
sha256: 96e5d2efec7c0814522922a020c71bf23b568e25348558235e85f3222e7bdbc3
generated_at: 2026-10-29T04:18:14.842209+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/tests/unit/credit-breakdown.test.ts

## Purpose

Unit tests for `creditBreakdownOf`, verifying that a partial credit note's per-rate tax rows reconcile to the refunded gross amount to the cent, that shipping is folded into rate rows rather than listed separately, and that multi-rate and zero-decimal-currency edge cases produce correct net/tax splits.

## Key elements

- **`invoice`** — fixture `CreditableInvoice` (EUR, two tax rates: 10 % and 22 %, 232.00 gross) used by the reconciliation and shipping tests.
- **`breakdownOf(source, amount)`** — small helper that chains `creditShares(source, amount, 'Refund')` into `creditBreakdownOf(…, source.currency)`, so each test reads as a single call.
- **`describe('creditBreakdownOf')`** suite with five cases:
  - *Reconciliation* — summed `grossAmount` across `taxSummary` equals the refund; `netTotal + taxTotal` ≈ refund.
  - *Shipping folded into rate rows* — `shippingNetAmount` is 0 and `shippingByRate` is empty.
  - *Mixed-rate exact split* — refunding 10.00 of 62.30 yields 2.92 @ 10 % and 7.08 @ 22 %, each taxed once.
  - *JPY (zero-decimal) currency* — 105 yen @ 8 % rounds tax to a whole yen (8), net 97.
  - *Line-specific credit* — crediting a single book line at its own 10 % rate, ignoring the invoice's 22 % row.

## Relationships

- **`src/modules/invoicing/domain/credit-shares.ts`** — exports `creditShares`, the allocation function that splits a refund across tax rates (and optionally across lines). This test is its primary consumer in the test graph.
- **`src/modules/invoicing/domain/index.ts`** — barrel re-export used here to import `creditShares` and the `CreditableInvoice` type.
- **`src/modules/invoicing/services/credit-breakdown.ts`** — exports `creditBreakdownOf`, the function under test. The test asserts its output shape (`taxSummary`, `netTotal`, `taxTotal`, `shippingNetAmount`, `shippingByRate`).

## Notes

- The helper always passes the literal description `'Refund'`; tests do not vary it.
- Cent-level assertions use `Math.round(gross * 100)` rather than floating-point equality, while the mixed-rate test uses `toBe`/`toEqual` on exact decimal values (2.65, 0.27, 5.80, 1.28) — the rounding strategy is `round(gross × rate / (1 + rate))`.
- The line-specific test calls `creditShares` directly with an override object (`{ lines, shipping }`) rather than going through `breakdownOf`, exercising the per-line allocation path independently.
