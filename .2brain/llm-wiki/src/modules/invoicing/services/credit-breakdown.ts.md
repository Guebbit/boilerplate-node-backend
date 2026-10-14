---
source: src/modules/invoicing/services/credit-breakdown.ts
sha256: ddffff86c87f615e82b357d867df2a2f884c9eb9a1dcec4dad3bc2bc774d7f25
generated_at: 2026-10-14T16:08:37.627165+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/services/credit-breakdown.ts

## Purpose

Computes the VAT/tax breakdown for a partial credit note by reusing the same tax function the original invoice used. It exists as a thin service-layer adapter so the invoicing **domain** layer never imports from the sibling `orders` module directly.

## Key elements

- **`creditBreakdownOf(lines, currency)`** — the sole export. Accepts the `CreditLine[]` produced by the credit-share logic plus the invoice currency, maps each line into the item shape `orderTaxBreakdown` expects (quantity, unit price, tax rate, `requiresShipping: false`), passes no shipping cost, and returns an `OrderTaxBreakdown`. It performs no delivery or mutation of its own; the result is folded into the rate rows by the caller.

## Relationships

- **`src/modules/invoicing/domain/index.ts`** — type-only import of `CreditLine` (re-exported from the domain barrel).
- **`src/modules/invoicing/domain/credit-shares.ts`** — produces the `CreditLine[]` that is fed into this function; this file is deliberately kept *outside* that domain module to respect the no-cross-module-import rule.
- **`src/modules/orders/index.ts`** → **`src/modules/orders/domain/tax.ts`** — provides `orderTaxBreakdown` and the `OrderTaxBreakdown` type used as the return value.
- **`src/modules/invoicing/services/issue-credit-note.ts`** — expected consumer; calls `creditBreakdownOf` and merges the returned breakdown into the credit-note rate rows.
- **`src/modules/invoicing/tests/unit/credit-breakdown.test.ts`** — unit tests for this module.

## Notes

- The file lives in `services/`, **not** `domain/`, specifically because `orderTaxBreakdown` belongs to the `orders` module and a domain folder is not permitted to import a sibling module.
- `shippingCost` is always passed as `undefined`; credit notes carry no shipping component.
- `requiresShipping` is hardcoded to `false` on every mapped item — the tax function uses it only to decide whether to apply shipping tax, which is irrelevant here.
