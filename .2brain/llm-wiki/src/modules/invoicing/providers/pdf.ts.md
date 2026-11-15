---
source: src/modules/invoicing/providers/pdf.ts
sha256: 35ba96e7ca40ab65c6e062a996f56e805d2e488e9b005eeeb46aafb53ed7bd70
generated_at: 2026-11-14T20:12:33.907504+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/providers/pdf.ts

## Purpose

The default (and only shipped) implementation of the `EInvoicingProvider` port. It renders an invoice or credit note to a PDF by piping an EJS template through Puppeteer/Chromium.

## Key elements

- **`pdfEInvoicingProvider`** (exported) — object matching the `EInvoicingProvider` interface (`name: 'pdf'`, `render(document) → Promise<Buffer>`). `render` does: EJS render → HTML → `renderHtmlToPdf` → `Buffer`.
- **`DOCUMENT_TEMPLATE`** — module-private path constant pointing to `templates/documents/invoicing.document.ejs`, one level deeper than the module's other templates.

## Relationships

- **`src/infrastructure/adapters/pdf.ts`** — provides `renderHtmlToPdf`, the Puppeteer step that turns the EJS-rendered HTML string into PDF bytes.
- **`src/modules/invoicing/emails.ts`** — provides `buildDocumentView(locale, document)`, which assembles the EJS render context from the document's fields.
- **`src/modules/invoicing/providers/index.ts`** — defines the `EInvoicingProvider` type that this file implements; this file is the sole concrete provider shipped.

## Notes

- The EJS `root` is set to `process.cwd()` so the template's root-relative includes (e.g. `/shared/templates/layouts/…`) resolve regardless of this module's depth under `src/modules`.
- The template lives at `templates/documents/` (one level deeper than sibling templates) **deliberately**: `mailer.ts#registerTemplateDirectories` collects templates non-recursively, so nothing else resolves this file by name. It is reached only by the explicit `path.join` here.
- The template is owned by this module, not by `shared/templates` — removing the invoicing module removes the template with it.
- Render locale is always the document's own frozen locale, never the viewer's request locale, because a document records what was issued and in which language.
