---
source: src/modules/invoicing/services/credit-breakdown.ts
sha256: 113ff892d61a54a4508570fcfa5f149119dd8209dc4800277aca8e95144cdd26
generated_at: 2026-11-08T06:13:58.484385+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/services/credit-breakdown.ts

## Purpose

Extracts the VAT/tax breakdown for a partial credit note by reusing the same tax function the original invoice used, so the credit figures reconcile exactly with the invoice. It lives in `services/` (not `domain/`) because it imports from the sibling `orders` module, which domain folders are not permitted to do.

## Key elements

- **`creditBreakdownOf(lines, currency)`** — The sole export. Accepts the `CreditLine[]` produced by the credit-share logic and an invoice currency, then delegates to `orderTaxBreakdown` from `@modules/orders`. Before delegating, it maps each line through `asTaxItems` and forces `requiresShipping: false` on every product (delivery cost is already folded into the rate rows, so no separate shipping line is emitted). Returns an `OrderTaxBreakdown`.

## Relationships

- **`domain/credit-shares.ts`** — Upstream producer of the `CreditLine[]` this function consumes. The two are deliberately split: credit-shares defines *how to split*; this file defines *how to tax the split*.
- **`domain/index.ts`** — Barrel re-export supplying `asTaxItems` and the `CreditLine` type.
- **`domain/tax-items.ts`** — Source of the `asTaxItems` mapper that converts credit lines into the item shape `orderTaxBreakdown` expects.
- **`@modules/orders` (`orders/index.ts` → `orders/domain/tax.ts`)** — Provides `orderTaxBreakdown` and the `OrderTaxBreakdown` return type. This is the cross-module dependency that forces this file out of the domain folder.
- **`services/issue-credit-note.ts`** — Primary caller; invokes `creditBreakdownOf` to populate the tax section of the issued credit note.
- **`tests/unit/credit-breakdown.test.ts`** — Unit tests for this function.
- **`delivery/tests/unit/fulfillment.test.ts`** — Validates the delivery/shipping assumption that underpins the `requiresShipping: false` override here.

## Notes

- **Why `requiresShipping: false`?** The credit-share logic already folds delivery cost into per-line rates. If a product's base record had `requiresShipping: true`, passing it through unchanged would cause `orderTaxBreakdown` to expect a separate shipping cost that doesn't exist, producing a mismatched total.
- **Why not in `domain/`?** The module header explicitly states the rule: a domain folder must not import a sibling module. `orderTaxBreakdown` lives in `orders`, so the call site must sit in `services/` or higher.
- **`shippingCost` is always `undefined`** in the call — there is no conditional path where a separate shipping line is passed.
