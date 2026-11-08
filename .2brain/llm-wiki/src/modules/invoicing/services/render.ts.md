---
source: src/modules/invoicing/services/render.ts
sha256: 677e1065facd1ba818ad39b2558e4b69e03f1bfb3c98062ac4c5e79ed27010ca
generated_at: 2026-11-08T06:15:44.968945+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/services/render.ts

## Purpose

Single rendering point for both invoice and credit-note PDFs. It lazily renders on first download (not at issue time), optionally caches the bytes on disk, and shields controllers from the e-invoicing provider port. The frozen row in Mongo is the source of truth; the stored file is a regenerable copy.

## Key elements

- **`renderInvoicePdf(invoice)`** *(exported)* — Renders an invoice's PDF via the provider port, returning `Buffer`.
- **`renderCreditNotePdf(creditNote)`** *(exported)* — Same for credit notes; additionally passes `reversalOf.invoiceNumber` to the provider.
- **`storedDocumentName(kind, id)`** *(exported)* — Builds the cache filename: `invoice-<id>.pdf` or `credit-note-<id>.pdf`.
- **`sharedFields(document, kind)`** *(internal)* — Maps a stored document to the provider's `EInvoicingDocument` shape. **Sole call-site** for `decryptInvoiceParty` on the billing address.
- **`storedOrRendered(name, render)`** *(internal)* — Orchestrates the read-cache → render → write-cache flow. Skips caching entirely when retention is `0`.
- **`readStored(name)`** *(internal)* — Reads a cached PDF; swallows errors into a `warn` log and returns `undefined`.
- **`storeBestEffort(name, bytes)`** *(internal)* — Writes a rendered PDF; a write failure logs a warning but still resolves with `bytes`.

## Relationships

- **`document-store.ts`** — Consumes `readDocument` / `writeDocument` as the PDF cache backend.
- **`logger.ts`** — Emits `warn`-level entries when a cache read or write fails.
- **`config.ts`** — Reads `NODE_INVOICE_PDF_RETENTION_DAYS` to decide whether caching is active.
- **`model.ts`** — Types the inputs (`InvoiceDocument`, `CreditNoteDocument`).
- **`pii.ts`** — Provides `decryptInvoiceParty` (the one plaintext reader for stored addresses) and the `InvoiceDocumentKind` discriminator.
- **`providers/index.ts`** — Resolves the e-invoicing provider port and supplies the `EInvoicingDocument` contract.
- **`services/index.ts`** — Barrel that re-exports the public API of this module.
- **`render.test.ts`** — Unit tests covering rendering, caching, and failure paths.

## Notes

- **Lazy, not eager.** PDFs are produced on first download, not at issue time, to avoid Chromium/disk cost for never-opened invoices.
- **Concurrent first downloads are safe.** Two simultaneous renders produce identical bytes; the store write is atomic, so last-writer-wins is harmless.
- **Retention = 0 disables caching entirely** — every download triggers a fresh render.
- **No error propagates from the cache layer.** Both read and write failures degrade gracefully: the caller always receives PDF bytes.
- **PII boundary.** `sharedFields` is the only place the encrypted billing address is decrypted; no other code in the module sees plaintext party data.
- **Stryker annotations** on the catch/reject handlers suppress mutation testing for the intentionally-no-op fallback branches.
