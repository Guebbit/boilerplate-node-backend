---
source: src/modules/invoicing/domain/tax-items.ts
sha256: 1ad6717d038115ac9c40004eadaa6af3786b644f69740fc5bf53404d14269e10
generated_at: 2026-10-29T04:11:20.241468+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/domain/tax-items.ts

## Purpose

Provides a single canonical mapping from a document's flat line shape (`quantity`, `unitPrice`, `taxRate`) into the nested shape that the shared tax functions (`orderTaxBreakdown`, `lineTaxFromRateTotals`) expect. It exists so that every consumer—invoice email rendering, credit-note totals, and VAT breakdown—reads a line the same way instead of each reinterpreting the fields independently.

## Key elements

- **`asTaxItems`** – Pure function that takes a readonly array of `{ quantity, unitPrice, taxRate }` and returns an array of `{ quantity, product: { price, taxRate } }`. The only export in the file.

## Relationships

- **`src/modules/invoicing/domain/index.ts`** – Barrel file; re-exports `asTaxItems` so consumers can import from the domain index.
- **`src/modules/invoicing/emails.ts`** – Invokes `asTaxItems` to normalise invoice lines before handing them to the tax functions for the email body.
- **`src/modules/invoicing/services/credit-breakdown.ts`** – Invokes `asTaxItems` to shape credit-note lines for the VAT breakdown calculation.
- **`src/modules/invoicing/services/issue-credit-note.ts`** – Invokes `asTaxItems` to shape lines for the credit-note total computation.

## Notes

- The function is a structural adapter, not a business-logic transformer: it only re-nests `unitPrice` → `product.price` and groups `taxRate` under `product`. No arithmetic is performed here.
- The module docblock deliberately names the three consuming contexts (invoice email, credit-note totals, VAT breakdown). If a fourth consumer is added, update that comment to keep the "one spelling" guarantee explicit.
- `asTaxItems` is a standalone function, not a class method or a memoised factory—safe to call inline without caching.
