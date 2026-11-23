---
source: src/modules/invoicing/services/render.ts
source_sha256: 9db1b9848d5b96b376ec2a2454724ae0f64a2722a01ce5e7f42d1526c2de9051
context_sha256: 6b86ba65d99c31913d58ccf24118c4e379f407f6ba40d6911794dd407cdf632b
generated_at: 2026-11-22T05:36:40.740418+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/invoicing/services/render.ts

## Purpose
Turns a frozen invoice or credit note into PDF bytes. It is the only place either document reaches `resolveEInvoicingProvider`, so controllers never need to know the provider port exists. PDFs are rendered lazily on the first download (not at issue), then kept on disk for `NODE_INVOICE_PDF_RETENTION_DAYS` and streamed from there. The frozen Mongo data is the record; the stored file is a regenerable copy.

## Key elements
- `renderInvoicePdf(invoice)`: returns the PDF bytes for an invoice, using the stored copy if present, otherwise rendering via the provider (`kind: 'invoice'`) and storing the result.
- `renderCreditNotePdf(creditNote)`: same flow with `kind: 'creditNote'`. Adds `reversalOf: { number: creditNote.invoiceNumber, reason: creditNote.reason }` so the PDF shows which invoice it reverses.
- `storedDocumentName(kind, id)`: exported. Builds the stored file name `` `${kind}-${id}.pdf` `` (e.g. `invoice-<id>.pdf`, `credit-note-<id>.pdf`).
- `sharedFields(document, kind)` (internal): maps the fields common to both documents onto the provider's `EInvoicingDocument` shape. It is the only place the stored billing address is decrypted (`decryptInvoiceParty`, with `kind` and `_id` for the AAD).
- `storedOrRendered(name, render)` (internal): the cache-or-render logic.
- `readStored` / `storeBestEffort` (internal): wrappers around the document store that swallow errors.

## Relationships
- `src/modules/invoicing/config.ts`: `invoicingConfig().NODE_INVOICE_PDF_RETENTION_DAYS` controls whether the store is used.
- `src/modules/invoicing/model.ts`: supplies the `InvoiceDocument` and `CreditNoteDocument` types being rendered.
- `src/modules/invoicing/pii.ts`: provides `decryptInvoiceParty` and the `InvoiceDocumentKind` type (`'invoice'` / `'credit-note'`).
- `src/modules/invoicing/providers/index.ts`: `resolveEInvoicingProvider().render(...)` produces the bytes. `EInvoicingDocument` is the input type.
- `src/infrastructure/adapters/document-store.ts`: `readDocument` / `writeDocument` persist and fetch the PDFs.
- `src/infrastructure/adapters/logger.ts`: its `logger` reports store read and write failures as warnings.
- `src/modules/invoicing/tests/unit/render.test.ts` is the unit test for this module.
- `src/modules/invoicing/services/index.ts` and `src/modules/invoicing/services/retention.ts` are graph neighbors, but this file does not import them. Nothing in this file shows how they use it.

## Notes
- A retention of `0` skips the store entirely: every call renders and nothing is read or written.
- Store failures never fail a download. A read error logs a warning and falls back to rendering. A write error logs a warning and still returns the rendered bytes.
- Two simultaneous first downloads both render. The code treats this as harmless because the bytes are identical and the store's write is atomic.
- Rendering is deterministic from the frozen row, so repeat downloads are byte-identical, barring a provider upgrade.
- The `// Stryker disable next-line all` comments exclude the warning logs from mutation testing.
