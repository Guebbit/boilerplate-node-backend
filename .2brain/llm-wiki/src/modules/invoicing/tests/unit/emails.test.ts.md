---
source: src/modules/invoicing/tests/unit/emails.test.ts
source_sha256: 6dd4539dd607a3fbee18b1d26b283df78f33c9b14bb72d92dae2ac7f38e1bfac
context_sha256: b6a9e8ed7d78b79dc1408cc5297cac66cdcdf6a1919b641b0214bbe6d18b03b9
generated_at: 2026-11-22T05:40:13.384831+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/invoicing/tests/unit/emails.test.ts

## Purpose
Unit tests for the invoice/credit-note document view builder in `@modules/invoicing/emails`. The view renders money and one line per item, so the tests guard against formatting slips that would read as billing errors. The suite is adapted from the retired `invoiceDocument` suite in `src/modules/orders/tests/unit/emails.test.ts`.

## Key elements
- **`SELLER`**: fixture for the shop's frozen identity (legal name, address). It has no VAT number by default, since that is the one optional field.
- **`DOCUMENT`**: fixture `EInvoicingDocument` with one line (Widget, qty 5, 19.99, 22% tax), a grand total of 99.95 EUR, `en` locale, and no shipping.
- **`describe('buildDocumentView')`**: covers the following.
  - One row per item, using each item's own title.
  - Meta captions, with the date formatted as `March 1, 2026`.
  - Parties captions.
  - Page meta title containing the document number.
  - Locale carry-through and translation (`it` vs `en`).
  - Invoice vs credit-note titles.
  - `reversalNotice`, shown only on credit notes and naming the original invoice.
  - Billing block present only when a billing address exists.
- **`buildDocumentFooter` tests**: the footer reads `Seller · VAT number: … · Invoice <number>`. It shows "VAT number not configured" when the seller has no VAT, and "Credit note" for credit notes.
- **`— a corrected buyer`**: the buyer VAT number line appears only when present and is localized (e.g. "Partita IVA" in Italian). A `correction` reversal says the invoice was "corrected" rather than refunded.
- **`— the erased buyer`**: `buyerErasedAt` yields a `buyerErasedNotice` and no billing block. A document that never had a buyer gets no notice.
- **`— the VAT block`**:
  - The line gross is `€99.95`, not the float artifact of 19.99 × 5.
  - Amounts are formatted as strings.
  - The shipping table is absent without `shippingByRate`, and has one row per rate (`10%`, `22%`) with it.
  - Amounts use the document's own currency (`£99.95` for GBP).
  - The supplier VAT line shows the number or "not configured".
- **`— the supplier block`**: the legal name matches the seller, and the address equals `addressLine(SELLER)`.
- **`taxCategoryCode` tests** (EN 16931 category, C4): `S` for any non-zero rate, `Z` for 0% with no rate type or `zero_rated`, `E` for 0% marked `exempt`.

## Relationships
- Imports `buildDocumentView`, `buildDocumentFooter` and `taxCategoryCode` from `src/modules/invoicing/emails.ts`, the code under test.
- Imports the `EInvoicingDocument` type from `src/modules/invoicing/providers/index.ts` to type fixtures.
- Imports `addressLine` from `src/modules/shop/index.ts` to assert that the supplier address matches the shop's own address rendering. That function is part of the shop module's public surface, so `src/modules/shop/service.ts` is only an indirect neighbor.

## Notes
- A line's title must never be re-resolved through `t()`, even when it collides with a real translation key such as `invoicing.document.title`. The test checks this in both `en` and `it`.
- Line amounts are re-derived from the frozen unit price, tax rate and quantity without a float multiply. The test comment cites 19.99 × 5 = 99.94999999999999 in IEEE 754.
- Tests cast the loosely typed view sections (`vat`, `billing`, etc.) with `as` to reach nested fields.
