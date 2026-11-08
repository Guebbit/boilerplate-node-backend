---
source: src/modules/invoicing/domain/tax-items.ts
sha256: 50ed6d35910db5c69c5c60de070439c30be7c9c1f592827bd023fe52ebf7c892
generated_at: 2026-11-08T06:10:43.813841+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/domain/tax-items.ts

## Purpose
Defines the single canonical line-item shape that the shared tax functions (`orderTaxBreakdown`, `lineTaxFromRateTotals`) expect. By funneling every document's lines through one mapper, it guarantees that the invoice email, credit-note totals, and VAT breakdown all interpret a "priced, taxed line" identically rather than each spelling the shape their own way.

## Key elements
- **`asTaxItems(lines)`** — Pure mapping function. Takes an array of flat `{ quantity, unitPrice, taxRate }` records and returns an array of `{ quantity, product: { price, taxRate } }` objects, which is the argument shape the tax-calculation helpers consume.

## Relationships
- **`domain/index.ts`** — Barrel file that re-exports `asTaxItems` so callers can import from the module root.
- **`emails.ts`** — Calls `asTaxItems` to reshape invoice lines before passing them into the tax functions for the invoice email body.
- **`services/credit-breakdown.ts`** — Calls `asTaxItems` to produce the input shape for `orderTaxBreakdown` when computing the VAT breakdown on a credit note.
- **`services/issue-credit-note.ts`** — Calls `asTaxItems` to reshape credit-note lines before computing taxed totals.

## Notes
- `unitPrice` is a **string** (currency amount as a decimal string), not a number. The mapped `product.price` preserves that type. Any caller that passes a numeric price will get a runtime shape mismatch against what the tax helpers expect.
- The function is intentionally a one-way flatten→nest mapping with no validation or rounding; it is not a domain model, just an adapter for the tax API surface.
