---
source: src/modules/invoicing/providers/pdf.ts
sha256: 0313832cc08f8d3e16f569b73b7e1ce05192eb61c9e3ad562a25ad411e3f4cc9
generated_at: 2026-10-29T04:12:50.274707+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/providers/pdf.ts

## Purpose

The default (and only shipped) implementation of the `EInvoicingProvider` port. It renders an invoice or credit note to a PDF by running the document's view through an EJS template and then printing the resulting HTML with Puppeteer, reusing the same `renderHtmlToPdf` pipeline the `orders` module uses for receipts.

## Key elements

- **`DOCUMENT_TEMPLATE`** – Resolved path to `templates/documents/invoicing.document.ejs`, the single EJS template every render passes through. Owned by this module (not by `shared/templates`); deleting the invoicing module removes it.
- **`pdfEInvoicingProvider: EInvoicingProvider`** – The exported provider object. Its `issue(document)` method:
  1. Calls `buildDocumentView(document.locale, document)` to produce the EJS context.
  2. Renders `DOCUMENT_TEMPLATE` with EJS (`root: process.cwd()` so root-relative `include`s resolve).
  3. Pipes the HTML string through `renderHtmlToPdf(html, { format: 'A4' })`.
  4. Returns the PDF as a `Buffer`.

## Relationships

- **`src/infrastructure/adapters/pdf.ts`** – Supplies `renderHtmlToPdf`, the Puppeteer-based HTML→PDF function used as the final rendering step.
- **`src/modules/invoicing/emails.ts`** – Supplies `buildDocumentView`, which shapes the document data into the view-model consumed by the EJS template.
- **`src/modules/invoicing/providers/index.ts`** – Defines the `EInvoicingProvider` type that `pdfEInvoicingProvider` satisfies; this file is the only concrete implementation of that port.

## Notes

- **Template placement is deliberate.** The file lives under `templates/documents/` (one level deeper than the module's other templates) so that `mailer.ts#registerTemplateDirectories`, which collects templates non-recursively, never picks it up by name. It is resolved only by this module's absolute `path.join`.
- **Locale is frozen, not request-driven.** The render always uses `document.locale`—the language the document was issued in—never the viewer's current locale.
- **EJS `root` option.** `root: process.cwd()` is required because the template includes a root-relative path (`/shared/templates/layouts/…`). Without it, EJS would resolve relative to the template's own directory and the include would break as the module's nesting depth changes.
