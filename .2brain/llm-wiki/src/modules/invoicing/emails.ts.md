---
source: src/modules/invoicing/emails.ts
sha256: b843e4546cd0a38c3e976f244cc5ad092507899f3c84562fd75ec900728f41a1
generated_at: 2026-11-08T06:11:05.339184+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/emails.ts

## Purpose

Builds the fully-rendered text content (the "copy") for invoice and credit-note PDFs. It takes a frozen `EInvoicingDocument` and a locale, resolves every label via i18n, formats all monetary values with `Intl.NumberFormat`, and returns a plain object ready for EJS template interpolation. Despite the `emails.ts` name (inherited from the orders module's convention for "this file builds a document's copy"), nothing here is mailed — the PDF is downloaded by the user.

## Key elements

- **`TaxCategoryCode`** — union type `'S' | 'Z' | 'E'` for the three EN 16931 VAT category codes this boilerplate emits.
- **`taxCategoryCode(taxRate, rateType)`** — maps a line's frozen rate and optional `rateType` to one of the three codes (`S` for any non-zero rate; `Z` vs `E` to distinguish zero-rated goods from exemption).
- **`DocumentVatRow` / `DocumentTaxSummaryRow` / `DocumentVatBlock`** — interfaces describing the per-line table, rate-grouped summary rows, and the full VAT block (columns, rows, shipping breakdown, totals, supplier identity) returned to the template.
- **`buildDocumentView(locale, document)`** — the single public entry point. Assembles `pageMetaTitle`, `title`, `reversalNotice`, `meta`, `billing`, `buyerErasedNotice`, and `vat` into one `Record<string, unknown>` for EJS.
- **`buildMeta`** (private) — number + long-form date (locale-aware, timezone-pinned).
- **`buildBilling`** (private) — frozen billing address or `undefined` for digital-only / pre-address-book orders.
- **`buildVatBlock`** (private) — the core builder. Creates one shared `Intl.NumberFormat` instance, formats every cell, computes VAT-exclusive unit prices (EN 16931 Art. 226(8)), allocates per-line tax from frozen rate-level totals via `lineTaxFromRateTotals` (BR-CO-17), and emits the supplier identity block.

## Relationships

- **`src/domain-primitives/money.ts`** — provides `minorUnitExponent`, `subtractMoney`, `toDecimalString`, `toMinorUnits` for currency-aware arithmetic and decimal-place pinning.
- **`src/infrastructure/i18n/index.ts`** (re-exporting `context.ts`) — provides `translator(locale)` used to resolve every human-readable string.
- **`src/modules/invoicing/model.ts`** — source of the `InvoiceLine` type (gives `unitPrice`, `taxRate`, `rateType`, etc.).
- **`src/modules/invoicing/providers/index.ts`** — source of the `EInvoicingDocument` type; `providers/pdf.ts` is the consumer that calls `buildDocumentView` and feeds the result into the EJS template.
- **`src/modules/invoicing/domain/index.ts`** (→ `tax-items.ts`) — provides `asTaxItems`, which adapts `InvoiceLine[]` into the shape `lineTaxFromRateTotals` expects.
- **`src/modules/orders/domain/tax.ts`** (via `src/modules/orders/index.ts`) — provides `lineTaxFromRateTotals`, the BR-CO-17 allocation function that splits a rate's frozen goods VAT across its lines.
- **`src/modules/shop/index.ts`** (→ `service.ts`) — provides `addressLine` for the seller's address string.
- **`src/modules/invoicing/index.ts`** — barrel re-export for the module's public API.
- **`src/modules/invoicing/tests/unit/emails.test.ts`** — unit tests for this file's exports.
- **`tests/unit/infrastructure/adapters/mailer-templates.test.ts`** — integration-level test that exercises the EJS template this file feeds.

## Notes

- **Named `emails.ts` but no email is sent.** The convention is borrowed from `@modules/orders/emails`; the output is always a downloaded PDF.
- **Unit price is printed VAT-exclusive.** The frozen `unitPrice` is gross; it is divided by `(1 + taxRate)` before formatting, with two extra decimal places beyond the currency's own to preserve precision (e.g. 19.90 at 22% → 16.3115).
- **Per-line tax is not independently computed.** Each line's tax is derived by spreading the frozen rate-level goods VAT (summary minus that rate's shipping slice) across the rate's lines, guaranteeing printed lines sum exactly to the frozen totals (BR-CO-17).
- **Only three EN 16931 category codes are ever emitted.** Reduced rate, reverse charge, export, and out-of-scope are out of scope for this boilerplate — see `docs/modules/invoicing.md`.
- **Decimal places come from the ISO 4217 table** (`minorUnitExponent`), never from the runtime's CLDR data, ensuring deterministic output regardless of host environment.
- **Credit notes share the invoice's structure.** A credit note is the same `DocumentVatBlock` shape over fewer or smaller lines; only the title, meta-title, and optional reversal notice differ.
- **`buyerErasedNotice`** appears when a GDPR erasure removed the buyer record and no billing address was frozen at issue time.
