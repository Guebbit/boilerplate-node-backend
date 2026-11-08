---
source: src/modules/invoicing/tests/unit/credit-breakdown.test.ts
sha256: 83f92d8a4b506da38277247f733ad8a898124d7a216612f181d69304b2211d63
generated_at: 2026-11-08T06:18:31.043553+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/tests/unit/credit-breakdown.test.ts

## Purpose

Unit tests for `creditBreakdownOf`, verifying that a partial credit note's per-rate rows (net, tax, gross) sum to exactly the refunded amount, that VAT is extracted once per rate, and that currency-specific rounding (decimal vs. zero-decimal) is handled correctly.

## Key elements

- **`invoice`** — EUR fixture with two tax rates (10 %, 22 %) and empty `lines`/`shippingByRate`; used as the default source.
- **`breakdownOf(source, amount)`** — local helper that calls `creditShares(source, amount, 'Refund')` then feeds the result into `creditBreakdownOf(…, source.currency)`.
- **`describe('creditBreakdownOf')`** — five tests:
  - *Reconciliation*: gross across summary rows equals the refunded amount to the cent.
  - *No shipping*: `shippingNetAmount` is `'0.00'` and `shippingByRate` is empty; shipped share is folded into rate rows.
  - *Mixed-rate exact values*: refunding 10.00 of 62.30 yields 2.92 @ 10 % and 7.08 @ 22 %, each taxed once; net/tax totals are `'8.45'` / `'1.55'`.
  - *Zero-decimal currency (JPY)*: 105 yen at 8 % rounds VAT to a whole yen (8), net 97.
  - *Line-item rate*: crediting a specific book at its own 10 % rate, ignoring the 22 % row present in the source invoice.

## Relationships

- **`src/modules/invoicing/domain/credit-shares.ts`** — provides the `creditShares` function and the `CreditableInvoice` type; the test calls `creditShares` to produce the per-rate share data that `creditBreakdownOf` then formats.
- **`src/modules/invoicing/domain/index.ts`** — barrel re-export consumed by the `import { … } from '../../domain'` statement.
- **`src/modules/invoicing/services/credit-breakdown.ts`** — exports `creditBreakdownOf`, the function under test; this file exercises its output shape and numeric correctness.

## Notes

- All monetary values are **string-encoded** (`'50.00'`, `'8'`); tests compare with `.toBe` on strings or use `Number(…)` / `toBeCloseTo` when summing.
- The JPY test intentionally omits decimal places to confirm the service does not emit a decimal separator for zero-decimal currencies.
- One test (the book test) bypasses the `breakdownOf` helper and calls `creditShares` directly with the `lines` option, isolating the line-item-rate path from the proportional-allocation path.
