---
source: src/modules/invoicing/providers/pdf.ts
source_sha256: 028ba6f6c5e1e4c8bb69f56edd23c54a18314e5777cad6ce0629b9bfd3344647
context_sha256: 6c1f9ff270231475c0191aa54fb9251bce63bb748532b315238982af951e799b
generated_at: 2026-11-22T05:33:31.983374+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/invoicing/providers/pdf.ts

## Purpose
The default (and only shipped) e-invoicing provider. It renders an invoice or credit note to a PDF by feeding an EJS template through the shared HTML-to-PDF (Chromium/Puppeteer) pipeline that `orders` also uses for its receipt.

## Key elements
- **`pdfEInvoicingProvider`** (export): an `EInvoicingProvider` named `'pdf'`. Its `render(document)` reads the logo, builds the view context, renders the EJS template to HTML, prints the HTML to PDF, and returns a `Buffer`.
- **`DOCUMENT_TEMPLATE`**: path to `../templates/documents/invoicing.document.ejs`. The module owns this template, and every render (invoice or credit note) uses it.
- **`readLogo()`**: reads `logo.svg` (next to the template) once and memoises it as a `data:image/svg+xml;base64,...` URI. A failed read clears the cache, so the next render retries.
- **`printOptions(footer)`**: the `page.pdf()` options. They set A4, backgrounds on, 16/16/20/16 mm margins, an empty header, and an inline-styled footer. The footer text is escaped with `ejs.escapeXML`.

## Relationships
- **`src/infrastructure/adapters/pdf.ts`**: supplies `renderHtmlToPdf(html, options)`, which does the Chromium printing.
- **`src/modules/invoicing/emails.ts`**: supplies `buildDocumentView(locale, document)`, the template context, and `buildDocumentFooter(locale, document)`, the footer line.
- **`src/modules/invoicing/providers/index.ts`**: defines the `EInvoicingProvider` port that this file implements.
- **`src/modules/invoicing/tests/unit/pdf-provider.test.ts`**: the unit test for this provider.

## Notes
- The logo is embedded as a `data:` URI because the renderer refuses every non-`data:` request (`refuseNonDataRequest`).
- Rendering always uses the document's own frozen locale (`document.locale`), never the viewer's request locale.
- The template sits one level deeper (`templates/documents/`) than the module's other templates. This keeps it out of the non-recursive collection in `mailer.ts#registerTemplateDirectories`. It is safe because it is only reached by path, never by name.
- EJS runs with `root: process.cwd()`, so root-relative `include("/...")` paths resolve from the project root.
- `printBackground` must stay on, or Chromium drops the tinted banner, chips and totals card. The empty `headerTemplate` suppresses Chromium's default date and title header.
