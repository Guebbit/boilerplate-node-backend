---
source: src/modules/invoicing/services/render.ts
sha256: 9f20b8bd772a242a72e6779a0ef7c2542f1421aa5c99065b70975eee8576b7ed
generated_at: 2026-10-14T16:10:18.605837+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/services/render.ts

## Purpose

Converts a frozen invoice or credit note into its PDF bytes. It is the single call-site for `resolveEInvoicingProvider`, so controllers never need to know the e-invoicing port exists. Rendering is lazy (first download, not issue time) and the result is cached on disk for a configurable retention period; the frozen Mongo row remains the source of truth.

## Key elements

- **`renderInvoicePdf(invoice)`** (exported) — Returns a `Promise<Buffer>` of the invoice PDF. Builds the provider payload via `sharedFields` and delegates to `storedOrRendered` with name `invoice-<id>.pdf`.
- **`renderCreditNotePdf(creditNote)`** (exported) — Same flow for a credit note; adds `reversalOf` pointing back to the original invoice number. Stored as `credit-note-<id>.pdf`.
- **`storedOrRendered(name, render)`** (private) — Checks disk first; on miss or read error, calls `render()` and attempts to write the result. Retention of `0` skips storage entirely. Any store I/O failure degrades to a plain render (logged, never thrown to the caller).
- **`sharedFields(document, kind)`** (private) — Maps the stored document's fields into the `EInvoicingDocument` shape the provider expects. This is the **only** place `decryptInvoiceParty` is called for the billing address.

## Relationships

- **`src/infrastructure/adapters/document-store.ts`** — `readDocument` / `writeDocument` provide the on-disk PDF cache.
- **`src/infrastructure/adapters/logger.ts`** — Warns when a cached PDF can't be read or a fresh render can't be persisted.
- **`src/modules/invoicing/config.ts`** — Reads `NODE_INVOICE_PDF_RETENTION_DAYS` to decide whether to use the disk cache at all.
- **`src/modules/invoicing/model.ts`** — Imports `InvoiceDocument` and `CreditNoteDocument` types that define the frozen document shape.
- **`src/modules/invoicing/pii.ts`** — `decryptInvoiceParty` is called here (and nowhere else) to obtain plaintext billing-address fields.
- **`src/modules/invoicing/providers/index.ts`** — `resolveEInvoicingProvider()` yields the active provider whose `.issue()` actually produces the PDF bytes.
- **`src/modules/invoicing/services/index.ts`** — Re-exports the two public render functions for the rest of the app.
- **`src/modules/invoicing/tests/unit/render.test.ts`** — Unit tests exercising render, caching, and PII-decryption paths.

## Notes

- **PII boundary:** `sharedFields` is the sole reader of the plaintext billing address. If you add a new render path, it must go through here to keep decryption centralized.
- **Retention `0`** disables the disk cache entirely; every request re-renders. Useful in dev/test or when the store adapter is unavailable.
- **Concurrent first-downloads** are safe: both render the same frozen row (byte-identical output) and the store's write is atomic, so the last writer wins without corruption.
- **Provider upgrade risk:** If the e-invoicing provider changes its PDF output, a previously cached file will be byte-different from a fresh render. The cache does not include a provider version in the filename.
