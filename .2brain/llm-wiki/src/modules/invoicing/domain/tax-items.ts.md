---
source: src/modules/invoicing/domain/tax-items.ts
source_sha256: 50ed6d35910db5c69c5c60de070439c30be7c9c1f592827bd023fe52ebf7c892
context_sha256: 8cc032a2d48c7686fbcb67dd3cb376ff47f09fa132749341e8b7b666bfa6cf69
generated_at: 2026-11-22T05:31:08.141051+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/invoicing/domain/tax-items.ts

## Purpose
Provides a single mapping from an issued document's frozen lines to the "priced, taxed item" shape the tax functions expect. Using one spelling of this conversion means the invoice email, a credit note's totals, and its VAT breakdown all read a line the same way.

## Key elements
- `asTaxItems(lines)`: maps each line `{ quantity, unitPrice, taxRate }` to `{ quantity, product: { price, taxRate } }`. `unitPrice` (a string, gross) becomes `product.price`, and `quantity` and `taxRate` are copied unchanged. The output shape is the one `orderTaxBreakdown` and `lineTaxFromRateTotals` take.

## Relationships
- Its graph neighbors are `src/modules/invoicing/domain/index.ts`, `src/modules/invoicing/emails.ts`, `src/modules/invoicing/services/credit-breakdown.ts` and `src/modules/invoicing/services/figures.ts`. The file's own doc comment names the invoice email, credit note totals and credit note VAT breakdown as the consumers it unifies. The file itself imports nothing, so those links run toward it.
- `orderTaxBreakdown` and `lineTaxFromRateTotals` are the tax functions whose input shape it produces. They are referenced only in the doc comment and are not imported here.

## Notes
- The function is pure: it takes a readonly array and returns a new one, with no rounding or arithmetic.
- `unitPrice` is documented as the gross unit price, and it stays a string in the output as `product.price`.
