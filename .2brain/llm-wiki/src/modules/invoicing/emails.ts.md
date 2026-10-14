---
source: src/modules/invoicing/emails.ts
sha256: a1e3119db0c9eb3013e9041f7d8d4b6b217e906c1ccffe5d1a793f6859724e27
generated_at: 2026-10-14T16:06:14.261707+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/emails.ts

## Purpose

Builds the fully-resolved text content (copy) for an invoice or credit-note PDF. Every localized string is translated, every monetary figure is formatted via `Intl.NumberFormat`, and the result is a flat render context that the EJS template (`invoicing.document.ejs`) merely interpolates. Despite the filename, nothing here is emailed — the document is downloaded as a PDF. The name follows the same "this file builds a document's copy" convention used by `@modules/orders/emails`.

## Key elements

- **`TaxCategoryCode`** (`'S' | 'Z' | 'E'`) — the only three EN 16931 VAT category codes this boilerplate ever emits (standard, zero-rated, exempt).
- **`taxCategoryCode(taxRate, rateType)`** — maps a line's frozen rate and `rateType` to its one-letter code. Non-zero → `S`; zero + `exempt` → `E`; zero otherwise → `Z`.
- **`DocumentVatRow` / `DocumentTaxSummaryRow` / `DocumentVatBlock`** — interfaces describing the shape of the per-line VAT table, the rate-grouped summary tables (shipping breakdown, per-rate summary), and the outer block (column headers, totals, supplier identity).
- **`buildMeta`** *(private)* — produces the number + localized date label under the document title.
- **`buildBilling`** *(private)* — returns the frozen billing address block, or `undefined` when the order had no address (digital-only / pre-address-book).
- **`buildVatBlock`** *(private)* — the core builder. Formats every amount, derives the VAT-exclusive unit price (Art. 226(8)), distributes each rate's frozen goods tax across its lines via `lineTaxFromRateTotals`, and assembles the full `DocumentVatBlock`.
- **`buildDocumentView(locale, document)`** *(exported, main entry point)* — calls the three private builders and returns a single `Record<string, unknown>` ready for EJS interpolation. Handles the credit-note vs. invoice title/notice distinction.

## Relationships

- **`src/infrastructure/i18n/index.ts`** — imports `translator` to obtain a localized `TFunction` for the given locale.
- **`src/modules/orders/index.ts`** — imports `lineTaxFromRateTotals` (per-line tax distribution) and `shopTimezone` (date rendering). The underlying tax reconciliation was done earlier by `src/modules/orders/domain/tax.ts` (`orderTaxBreakdown`); this file only formats the frozen results.
- **`src/modules/invoicing/model.ts`** — imports the `InvoiceLine` type (specifically the `rateType` field) for `taxCategoryCode`.
- **`src/modules/invoicing/providers/index.ts`** — imports the `EInvoicingDocument` type that parameterizes every builder.
- **`src/modules/invoicing/providers/pdf.ts`** — the PDF provider calls `buildDocumentView` and feeds the returned object into the EJS template.
- **`src/modules/invoicing/index.ts`** — module barrel; re-exports this file's public API.
- **`src/modules/invoicing/tests/unit/emails.test.ts`** — unit tests for the functions in this file.
- **`tests/unit/infrastructure/adapters/mailer-templates.test.ts`** — tests the EJS templates that consume the render context produced here.

## Notes

- **No tax is computed here.** Every figure is read from the frozen `EInvoicingDocument`. The only arithmetic is (a) dividing the gross unit price by `(1 + taxRate)` to get the VAT-exclusive price required by Art. 226(8), and (b) calling `lineTaxFromRateTotals` to spread a rate's already-rounded goods tax across its constituent lines (BR-CO-17).
- **Unit-price precision:** the net unit price is rendered with two extra decimal places beyond the currency's minor unit (e.g. 19.90 at 22% → 16.3115), permitted by EN 16931 BT-146.
- **Reduced-rate, reverse-charge, and export VAT codes are intentionally absent.** `taxCategoryCode` can only return `S`, `Z`, or `E`. If a reduced rate is needed, the scope of this boilerplate must be extended (see `docs/modules/invoicing.md`).
- **Credit notes are structurally identical to invoices.** The render context shape does not change; only the title, meta title, and an optional reversal notice differ. This reflects the current "full reversal" refund model rather than a partial-credit model.
- **`Intl.NumberFormat` instances are created once per call to `buildVatBlock`** and reused for all cells — a deliberate micro-optimization noted in the source.
