---
source: src/modules/invoicing/emails.ts
source_sha256: 523c9ce5e84698b66aa72eeaca212a6c8209b2a897e686e6dcd7f3e91b1b4752
context_sha256: 9548b8a0acd2818023496d015a41a9925cd84c7023bba6ff2b4166cf347de9ef
generated_at: 2026-11-22T05:31:27.360683+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/invoicing/emails.ts

## Purpose
Resolves the copy of every document the invoicing module renders (invoice and credit-note PDFs) into finished, localized strings. The language is an argument and the output is final text, so the EJS template queued behind it only interpolates. It follows the `@modules/orders/emails` naming convention ("builds a document's copy"), even though nothing here is mailed. The PDF is downloaded, never sent.

## Key elements
- `TaxCategoryCode`: type `'S' | 'Z' | 'E'`, the EN 16931 VAT category codes this boilerplate prints (Standard, Zero-rated, Exempt).
- `taxCategoryCode(taxRate, rateType)`: returns `'S'` for any non-zero rate. For a 0% rate it returns `'E'` if `rateType === 'exempt'`, otherwise `'Z'`.
- `DocumentVatRow`: one per-line VAT table row, with all amounts pre-formatted as strings plus `categoryCode`.
- `DocumentTaxSummaryRow`: one row of a rate-grouped table (the shipping breakdown or the per-rate summary).
- `DocumentVatBlock`: the full VAT section. It holds translated column headers, per-line `rows`, an optional `shipping` table, the `summaryRows`, net/tax/grand totals with their labels, and the seller's `supplier` identity (legal name, VAT number line, address).
- `buildMeta` (internal): captions plus number, issue date and order number. The date is formatted with `Intl.DateTimeFormat` in the document's timezone.
- `buildBilling` (internal): the frozen billing address block. It returns `undefined` when there is no billing address, and adds a buyer VAT-number line when one exists.
- `buildVatBlock` (internal): formats the VAT table and totals from the frozen document.
- `buildDocumentFooter(locale, document)`: exported. Returns "seller · VAT number · title + document number", joined with ` · `. The title is the credit-note or invoice title depending on `document.kind`. The browser's page footer prints it, not the template.
- A further render-context builder for invoice and credit-note PDFs follows `buildDocumentFooter` in the file. Its body is not covered here.

## Relationships
- `src/domain-primitives/money.ts`: `minorUnitExponent`, `subtractMoney`, `toDecimalString` and `toMinorUnits` handle currency precision and the goods-tax subtraction.
- `src/infrastructure/i18n/index.ts`: `translator(locale)` supplies `t` in `buildDocumentFooter`. `TFunction` is typed from i18next.
- `src/modules/orders/index.ts`: `lineTaxFromRateTotals` spreads each rate's frozen goods VAT over its lines. The rate figures were reconciled earlier by `orderTaxBreakdown` in `src/modules/orders/domain/tax.ts`.
- `src/modules/shop/index.ts`: `addressLine(seller)` formats the supplier address.
- `src/modules/invoicing/providers/index.ts`: the `EInvoicingDocument` type is the frozen input.
- `src/modules/invoicing/model.ts`: the `InvoiceLine['rateType']` type.
- `src/modules/invoicing/domain/index.ts`: `asTaxItems` adapts the document lines for `lineTaxFromRateTotals`.
- `src/modules/invoicing/tests/unit/emails.test.ts` covers this file, and `tests/unit/infrastructure/adapters/mailer-templates.test.ts` is a related test.

## Notes
- Nothing is recomputed. Rate totals are frozen at issue time and the file only formats them. Per BR-CO-17, a line's tax share is its rate's goods VAT (summary tax minus its shipping slice) spread across the rate's lines, so printed lines sum exactly to the frozen totals.
- Amounts use the document's own frozen currency. Decimal places come from the pinned ISO 4217 table via `minorUnitExponent`, not from runtime CLDR data.
- The printed unit price is VAT-exclusive (Art. 226(8)). The frozen gross `unitPrice` is divided by `1 + taxRate` and shown with 2 extra decimals beyond the currency's own.
- Only the per-line table shows the category column. The summary tables stay grouped by rate alone.
- Category codes beyond S/Z/E (reverse charge, export, reduced rate, and so on) are deliberately out of scope. Any non-zero rate is `S`.
- The seller's missing VAT number falls back to the `vat-number-missing` translation rather than being omitted.
- The footer is printed by the browser's page footer rather than the template, which is why it has its own builder.
