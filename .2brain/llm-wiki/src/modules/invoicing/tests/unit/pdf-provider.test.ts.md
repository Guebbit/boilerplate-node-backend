---
source: src/modules/invoicing/tests/unit/pdf-provider.test.ts
source_sha256: 778999195b9fe9ad1f9399723e6788fbe00632b7ed82bf2536d77efdce2c577e
context_sha256: 879f3b3e20fcff4e1f9eeaec3df470a4db3eefecd94efe7cadbd71091de1bd0e
generated_at: 2026-11-22T05:40:28.953372+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/invoicing/tests/unit/pdf-provider.test.ts

## Purpose
Unit test for the shipped PDF e-invoicing provider's real HTML output. It renders the actual EJS template through `pdfEInvoicingProvider.render` while replacing the browser, so the markup passed to the PDF renderer can be inspected. It complements the view-model test (`emails.test.ts`), which proves the strings exist, by proving the template actually prints them.

## Key elements
- `printed` — a `jest.fn` that stands in for the browser. It records the `(html, options)` of each print call. `@infrastructure/adapters/pdf`'s `renderHtmlToPdf` is mocked to forward to it. `beforeEach` resets it and makes it resolve to an empty `Uint8Array`.
- `DOCUMENT` — a baseline `EInvoicingDocument`: an EUR/`en` invoice billed to a business with a VAT number, one 22% line, and net, tax and grand totals.
- `htmlOf(document)` — renders a document and returns the first HTML argument passed to `printed`.
- Test cases in `describe('the invoice template')`:
  - Buyer VAT number is shown for a business and omitted for a private buyer.
  - A correction credit note says "cancels invoice …" and keeps the old buyer. A refund credit note says "reverses invoice …".
  - An invoice prints every legal field. The list includes the order number, seller, buyer, line, rate chip, totals and column headers. It also prints "VAT number not configured".
  - The shipping breakdown appears only when `shippingByRate` is non-empty.
  - The logo is an inline `data:image/svg+xml;base64` URI, and no `src`/`href` points at `http(s):`.
  - The reversal banner (`class="notice"`) appears on credit notes only.
  - An erased buyer (`buyerErasedAt`, no address) shows "personal data was removed" instead of the address.
  - Render options include `format: 'A4'` and `printBackground: true`.
  - The page footer repeats the seller, VAT number and document number, with the seller name HTML-escaped.
  - The logo read is retried after a failed read rather than caching the failure.

## Relationships
- `src/modules/invoicing/providers/pdf.ts` — the module under test (`pdfEInvoicingProvider`). The tests call its `render` method and check the HTML and options it hands to the PDF renderer. The logo-retry test imports a fresh isolated copy of it.
- `src/modules/invoicing/providers/index.ts` — supplies the `EInvoicingDocument` type used to build the fixtures. This is a type-only import.

## Notes
- `@infrastructure/adapters/pdf` is mocked, so no real browser is launched.
- Tests that compare two renders call `printed.mockClear()` between them, because `htmlOf` always reads `mock.calls[0]`.
- The logo-retry test swaps only `readFile` in `node:fs/promises`, keeping the real implementation for everything else. It does this in an isolated module registry so the provider's memoised logo starts empty. It then calls `jest.dontMock` to clean up.
- Assertions match English strings and formatted amounts (for example `€12.20`, `March 1, 2026`), so they depend on the `en` locale and the `Europe/Rome` timezone fixture.
