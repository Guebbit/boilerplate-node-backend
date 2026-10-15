---
source: src/modules/invoicing/emails.ts
sha256: 1358c42acb97a5a8b659c692092272d661b56f266f160c47be43d532d1b1070a
generated_at: 2026-10-15T10:38:20.548561+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/emails.ts

## Purpose

Builds the fully-formatted, localized view context (all labels, amounts, and dates as finished strings) that the EJS PDF template interpolates for invoices and credit notes. It performs no calculation beyond formatting: every tax figure is frozen onto the document at issue time. The file is named `emails.ts` to match the `@modules/orders` convention for "this file builds a document's copy," even though nothing here is mailed—the PDF is downloaded, never sent.

## Key elements

- **`TaxCategoryCode`** — union type `'S' | 'Z' | 'E'` for the three EN 16931 VAT category codes this boilerplate emits.
- **`taxCategoryCode(taxRate, rateType)`** — maps a line's frozen rate + reason to the one-letter code: non-zero → `S`; zero with `rateType === 'exempt'` → `E`; zero otherwise → `Z`.
- **`DocumentVatRow` / `DocumentTaxSummaryRow` / `DocumentVatBlock`** — interfaces describing the shape of the VAT table, rate-grouped rows, and the full block (columns, rows, shipping, totals, supplier identity) returned to the template.
- **`buildMeta`, `buildBilling`, `buildVatBlock`** (internal) — format the number/date block, the billing address, and the full VAT table respectively. `buildVatBlock` reuses one `Intl.NumberFormat` instance per currency and derives per-line tax from the frozen rate-level totals via `lineTaxFromRateTotals`.
- **`buildDocumentView(locale, document)`** (exported) — the single public entry point; assembles `locale`, `pageMetaTitle`, `title`, `reversalNotice`, `meta`, `billing`, and `vat` into a flat `Record<string, unknown>` for `templates/invoicing.document.ejs`.

## Relationships

- **`src/infrastructure/i18n/index.ts` / `context.ts`** — imports `translator` (the `t` factory) and the `TFunction` type; every user-facing label is resolved through i18next keys under `invoicing.document.*`.
- **`src/modules/orders/index.ts` → `config.ts`** — provides `shopTimezone()` used to format the document date in the shop's own timezone.
- **`src/modules/orders/index.ts` → `domain/tax.ts`** — provides `lineTaxFromRateTotals()`, which apportion the frozen per-rate VAT across individual lines so printed line amounts sum exactly to the frozen totals.
- **`src/modules/invoicing/model.ts`** — supplies the `InvoiceLine` type (frozen `taxRate`, `rateType`, `unitPrice`, `quantity`, `title`).
- **`src/modules/invoicing/providers/index.ts`** — supplies the `EInvoicingDocument` type that carries all frozen fields (lines, `taxSummary`, `shippingByRate`, seller, currency, kind, etc.).
- **`src/modules/invoicing/providers/pdf.ts`** — consumes the object returned by `buildDocumentView` as the render context for the EJS template.
- **`src/modules/invoicing/index.ts`** — barrel-re-exports this file's public symbols.
- **`src/modules/invoicing/tests/unit/emails.test.ts`** — unit-tests `taxCategoryCode`, `buildDocumentView`, and the VAT-block formatting logic.
- **`tests/unit/infrastructure/adapters/mailer-templates.test.ts`** — exercises the EJS template that interpolates the view this file produces.

## Notes

- **No reduced-rate or reverse-charge codes.** EN 16931 defines additional category codes (reduced rate, reverse charge, export, out-of-scope); this module deliberately supports only `S`, `Z`, `E`. Reduced-rate handling is out of scope—see `docs/modules/invoicing.md`.
- **Unit price is printed net of VAT.** The frozen `unitPrice` is gross; `buildVatBlock` divides by `(1 + taxRate)` and formats with two extra decimal places beyond the currency's native precision (Art. 226(8) / BT-146 permits any precision).
- **Per-line tax is derived, not re-rounded.** Each line's tax share is computed from the already-rounded rate-level total (minus that rate's shipping slice), so the printed lines always add up to the frozen summary.
- **`billing` may be `undefined`.** Digital-only or pre-address-book orders carry no billing address; the template must handle the absent block.
- **Credit notes share the exact same shape.** `buildDocumentView` branches only on `document.kind` for the title and the optional `reversalNotice`; the VAT block is structurally identical.
