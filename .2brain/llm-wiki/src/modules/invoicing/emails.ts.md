---
source: src/modules/invoicing/emails.ts
sha256: 54ca097e40c65df4117dc22b6570f4c95071cdfdab83dd806becfc126b98998f
generated_at: 2026-10-29T04:11:38.620861+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/emails.ts

## Purpose

Builds the finished, localized text content for invoicing documents (invoices and credit notes) that the PDF provider interpolates into an EJS template. All monetary figures are already frozen onto the document at issue time; this file only formats and assembles them into a render context. Despite the name (inherited from the orders module's convention), nothing here is mailed — the document is downloaded as a PDF.

## Key elements

- **`TaxCategoryCode`** — type alias restricted to `'S' | 'Z' | 'E'` (EN 16931 standard, zero-rated, exempt).
- **`taxCategoryCode(taxRate, rateType)`** — maps a line's frozen rate and reason to its one-letter category code. Non-zero → `S`; zero + `exempt` → `E`; zero otherwise → `Z`.
- **`DocumentVatRow`** / **`DocumentTaxSummaryRow`** — row shapes for the per-line VAT table and the rate-grouped summary tables, respectively. All monetary fields are pre-formatted strings.
- **`DocumentVatBlock`** — the full VAT table structure: column headers, line rows, optional shipping breakdown, per-rate summary, totals, and the seller's legal identity.
- **`buildMeta`** *(private)* — number + long-form date label, timezone-aware via `Intl.DateTimeFormat`.
- **`buildBilling`** *(private)* — frozen billing address as `fullName` + `lines[]`, or `undefined` for digital-only orders.
- **`buildVatBlock`** *(private)* — the core formatter. Creates `Intl.NumberFormat` instances pinned to the document's ISO 4217 minor-unit exponent, distributes per-line tax from rate-level totals via `lineTaxFromRateTotals`, and assembles the full `DocumentVatBlock`.
- **`buildDocumentView(locale, document)`** — the sole public entry point. Returns a `Record<string, unknown>` render context (`pageMetaTitle`, `title`, `meta`, `billing`, `vat`, optional `reversalNotice`, `buyerErasedNotice`) for the EJS template.

## Relationships

- **`src/domain-primitives/money.ts`** — imports `minorUnitExponent` to pin `Intl.NumberFormat` fraction digits to the ISO 4217 table rather than runtime CLDR data.
- **`src/infrastructure/i18n/index.ts`** (and `context.ts`) — imports `translator` to obtain a `TFunction` scoped to the document's frozen locale.
- **`src/modules/orders/index.ts`** → **`domain/tax.ts`** — imports `lineTaxFromRateTotals`, which distributes a rate's frozen VAT total across its constituent lines so printed lines sum to the frozen summary.
- **`src/modules/invoicing/model.ts`** — imports `InvoiceLine` type (source of `taxRate`, `rateType`, `unitPrice`, `quantity`).
- **`src/modules/invoicing/providers/index.ts`** — imports `EInvoicingDocument` type; the PDF provider in **`providers/pdf.ts`** is the consumer that calls `buildDocumentView` and feeds the result to the EJS template.
- **`src/modules/invoicing/domain/index.ts`** → **`domain/tax-items.ts`** — imports `asTaxItems` to adapt invoice lines into the shape `lineTaxFromRateTotals` expects.
- **`src/modules/invoicing/tests/unit/emails.test.ts`** — unit tests for `taxCategoryCode` and `buildDocumentView`.
- **`tests/unit/infrastructure/adapters/mailer-templates.test.ts`** — integration-level tests that exercise the EJS templates this file feeds.

## Notes

- **Net unit price is printed with 2 extra decimal places** beyond the currency's own (e.g., 4 dp for EUR at 19.90 / 22%). The frozen `unitPrice` is gross; it is divided by `(1 + taxRate)` before formatting. EN 16931 BT-146 permits any precision.
- **Per-line tax is never computed independently.** Each rate's VAT was rounded once on its whole taxable total and frozen in `taxSummary`. This file splits that total across lines via `lineTaxFromRateTotals` so printed lines sum exactly to the frozen summary (BR-CO-17).
- **The `categoryCode` column appears only in the per-line table.** Rate-grouped summary tables (shipping, per-rate) omit it because a rate group can contain lines of different legal categories.
- **Reduced-rate EN 16931 codes are intentionally out of scope.** Only `S`, `Z`, `E` are produced; a non-zero rate is always `S`.
- **No figures are recomputed.** Every amount was reconciled by `orders/domain/tax.ts#orderTaxBreakdown` at issue time and frozen onto the document. This file is purely a formatter.
