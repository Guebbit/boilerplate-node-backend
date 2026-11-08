---
source: src/modules/invoicing/tests/unit/emails.test.ts
sha256: 84012360dd4cf1e68a2522f672b152726e5deb2781a314a07ef5a471aed41e49
generated_at: 2026-11-08T06:18:58.973980+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/tests/unit/emails.test.ts

## Purpose
Unit tests for the invoice / credit-note document renderer (`buildDocumentView`) and the EN 16931 tax-category helper (`taxCategoryCode`). It locks down rendering correctness (line rows, VAT block, supplier block, locale, reversal notices, buyer erasure) so that a formatting slip is caught before a customer reads it as a billing error. Adapted from the retired `invoiceDocument` suite in `orders/tests/unit/emails.test.ts`.

## Key elements
- **`SELLER`** – Frozen seller identity (Acme S.r.l., Milano) used as the `seller` field across all fixtures; no `vatNumber` set by default.
- **`DOCUMENT`** – Minimal single-line invoice fixture (5 × "Widget" @ 19.99, 22 % VAT, EUR). Chosen so that any simpler shape would mask bugs.
- **`describe('buildDocumentView')`** – Core rendering: one row per item, document number in `pageMetaTitle`, locale propagation, title-collision protection (titles are never passed through `t()`), "Invoice" vs "Credit note" titles, reversal notice (credit-note only), billing-address block presence/absence.
- **`describe('… the erased buyer')`** – `buyerErasedNotice` appears only when `buyerErasedAt` is set; no notice for a document that never had a buyer.
- **`describe('… the VAT block')`** – Line net/tax/gross re-derived from frozen strings (not float-multiply), all amounts are `string` via `Intl.NumberFormat`, shipping sub-table appears only when `shippingByRate` is non-empty, currency symbol follows the document's frozen `currency`, VAT-number line or "not configured" fallback.
- **`describe('… the supplier block')`** – Seller name and address are printed via the shop's `addressLine` helper.
- **`describe('taxCategoryCode — EN 16931 category, C4')`** – Maps (rate, rateType) → `'S'` (any non-zero), `'Z'` (0 % / zero_rated), `'E'` (0 % / exempt).
- **`describe('… the VAT table's category column, C4')`** – Renders Z and E as distinct rows; column label is locale-translated.
- **`describe('… net unit price and once-per-rate VAT, worked example')`** – Mixed-rate fixture (`MIXED`) validating Art. 226(8) net-of-VAT unit price to two places beyond the cent, per-rate shipping, and tax-summary consistency.

## Relationships
- **`src/modules/invoicing/emails.ts`** – The system under test. Imports `buildDocumentView` and `taxCategoryCode`.
- **`src/modules/invoicing/providers/index.ts`** – Supplies the `EInvoicingDocument` type used to shape every fixture.
- **`src/modules/shop/index.ts`** – Supplies `addressLine`, the canonical shop-address formatter asserted in the supplier-block test.

## Notes
- **Float-safety is a first-class concern.** The VAT-block test explicitly documents that `19.99 × 5` is `99.9499…` in IEEE 754; the renderer must print the frozen `'99.95'` string, never a re-computed float.
- **Titles are opaque.** A dedicated test sets a line title to the i18n key `'invoicing.document.title'` and asserts it passes through unchanged in both `en` and `it` locales — guarding against a future `t()` call on user-supplied titles.
- **All monetary values are frozen decimal strings** on `EInvoicingDocument`; the renderer formats them with `Intl.NumberFormat` but must never parse-and-re-multiply them.
- **Art. 226(8)** (Italian VAT law) requires the unit price printed on the invoice to be net of VAT; the worked-example suite asserts two-decimal-beyond-cent precision for that field.
