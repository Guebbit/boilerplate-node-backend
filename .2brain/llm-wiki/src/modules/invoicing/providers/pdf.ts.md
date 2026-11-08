---
source: src/modules/invoicing/providers/pdf.ts
sha256: 0313832cc08f8d3e16f569b73b7e1ce05192eb61c9e3ad562a25ad411e3f4cc9
generated_at: 2026-11-08T06:13:07.922080+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/providers/pdf.ts

## Purpose
The default (and only shipped) e-invoicing PDF provider. It renders an invoice or credit note to PDF by piping an EJS template through the shared Chromium rendering adapter. It exists to satisfy the `EInvoicingProvider` port so the invoicing module can issue documents without depending on a concrete renderer.

## Key elements
- **`DOCUMENT_TEMPLATE`** — `path` constant pointing to `templates/documents/invoicing.document.ejs`. Intentionally nested one level deeper than other module templates so it is *not* swept up by `mailer.ts`'s non-recursive `registerTemplateDirectories`; it is resolved directly by this file.
- **`pdfEInvoicingProvider`** (exported) — Object conforming to `EInvoicingProvider` (`name: 'pdf'`). Its `issue(document)` method:
  1. Builds a render context via `buildDocumentView(document.locale, document)`.
  2. Renders `DOCUMENT_TEMPLATE` with EJS (`root: process.cwd()` so the template's root-relative `/shared/templates/layouts/…` include resolves).
  3. Passes the resulting HTML to `renderHtmlToPdf(…, { format: 'A4' })`.
  4. Returns the bytes as a `Buffer`.

## Relationships
- **`src/infrastructure/adapters/pdf.ts`** — Imports `renderHtmlToPdf` (the Puppeteer/Chromium step). This file does not own the rendering engine; it delegates.
- **`src/modules/invoicing/emails.ts`** — Imports `buildDocumentView`, which assembles the data context (line items, parties, totals, etc.) the EJS template expects.
- **`src/modules/invoicing/providers/index.ts`** — Imports the `EInvoicingProvider` type (the port). This file is the sole concrete implementation registered there.

## Notes
- **Locale is frozen to the document's own locale**, never a viewer's request locale — a PDF is a record of what was issued, in the language it was issued in.
- **Template ownership**: the `.ejs` file lives under this module's `templates/documents/` directory, not in `shared/templates`. Deleting the invoicing module deletes the template; it is not a shared asset.
- **`root: process.cwd()`** on the EJS call is required because the template uses a root-relative include (`/shared/templates/layouts/…`). Without it the include would resolve relative to the template's own directory and fail.
- The deeper `templates/documents/` nesting is a deliberate convention to keep the file out of the mailer's non-recursive directory walk; do not "flatten" it into `templates/` without updating `mailer.ts`.
