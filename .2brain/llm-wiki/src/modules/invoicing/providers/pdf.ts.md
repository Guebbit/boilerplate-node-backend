---
source: src/modules/invoicing/providers/pdf.ts
sha256: 27a4468190b6543dedea085b9ba3484a3988a8fbf674a01f4f59e1c9cc530996
generated_at: 2026-10-15T10:39:04.430152+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/providers/pdf.ts

## Purpose

The sole shipped implementation of the `EInvoicingProvider` port. It renders an invoice or credit note to PDF by piping an EJS template through Puppeteer (A4), returning a byte buffer with a `application/pdf` content type. It exists so that consumers of the port in `./index.ts` get a concrete, self-contained rendering path without depending on any other provider.

## Key elements

- **`DOCUMENT_TEMPLATE`** (module-level const) — Resolves the EJS file at `templates/documents/invoicing.document.ejs` relative to the module. This template is owned by the invoicing module (not `shared/templates`) and is intentionally one directory level deeper so that `mailer.ts#registerTemplateDirectories` (non-recursive) never picks it up by name.
- **`pdfEInvoicingProvider`** (export, satisfies `EInvoicingProvider`) — Exposes:
  - `name: 'pdf'`
  - `issue(document)` — Calls `buildDocumentView(document.locale, document)` to build the EJS context, renders `DOCUMENT_TEMPLATE` with `root: process.cwd()` (so the template's root-relative `include` of a shared layout resolves correctly), then passes the HTML to `renderHtmlToPdf(html, { format: 'A4' })`, and finally wraps the result as `{ contentType: 'application/pdf', bytes: Buffer }`.

## Relationships

- **`src/infrastructure/adapters/pdf.ts`** — Provides `renderHtmlToPdf`, the Puppeteer-based HTML→PDF step. This file is a thin consumer of that adapter; no other module in this directory calls it.
- **`src/modules/invoicing/emails.ts`** — Provides `buildDocumentView`, which assembles the EJS rendering context (fields, line items, etc.) for a given document and locale. This file calls it with the document's *own* frozen locale, not a viewer's request locale.
- **`src/modules/invoicing/providers/index.ts`** — Defines the `EInvoicingProvider` port type. This file is the only implementation currently shipped against that port.

## Notes

- **Locale is fixed at render time.** The locale passed to `buildDocumentView` is `document.locale` (the language in which the document was issued). A viewer's request locale is never consulted; the PDF is a historical record.
- **EJS `root` option.** `root: process.cwd()` is required so the template's `/shared/templates/layouts/...` include resolves correctly regardless of how deep this module sits under `src/modules`. Without it the include 404s.
- **Template placement is deliberate.** `templates/documents/` is one level below the module's other templates so the mailer's non-recursive directory walker never resolves this file by bare name. The only entry point is the direct `path.join` here.
- **No streaming / async iterator.** `issue` returns a single `{ bytes }` buffer. Callers must handle size themselves.
