---
source: src/modules/invoicing/services/render.ts
sha256: 677e1065facd1ba818ad39b2558e4b69e03f1bfb3c98062ac4c5e79ed27010ca
generated_at: 2026-10-29T04:15:27.433394+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/services/render.ts

## Purpose

Converts a frozen invoice or credit-note row into its PDF bytes. It is the single call site for the e-invoicing provider's `issue` method, so controllers never reference the provider port directly. PDFs are rendered lazily on first download (not at issue time), cached on disk for a configurable retention window, and streamed back on subsequent downloads.

## Key elements

- **`renderInvoicePdf(invoice)`** — Returns the invoice's PDF bytes, reading the stored copy if present or rendering and storing a fresh one.
- **`renderCreditNotePdf(creditNote)`** — Same flow for credit notes; additionally includes `reversalOf` referencing the parent invoice number.
- **`storedDocumentName(kind, id)`** — Builds the on-disk file name (e.g. `invoice-<id>.pdf`).
- **`sharedFields(document, kind)`** — Maps a stored document's fields into the `EInvoicingDocument` shape the provider expects; this is the sole decryption point for the billing address.
- **`storedOrRendered(name, render)`** — Core read-or-render logic; skips storage entirely when retention is `0`.
- **`readStored(name)`** — Reads a cached PDF; returns `undefined` on any read error (logged, never thrown).
- **`storeBestEffort(name, bytes)`** — Writes rendered bytes to disk; returns the bytes regardless of write success.

## Relationships

- **`providers/index.ts`** — Calls `resolveEInvoicingProvider().issue(...)` to actually produce the PDF bytes.
- **`pii.ts`** — Calls `decryptInvoiceParty` inside `sharedFields`; the only consumer of the billing address plaintext.
- **`document-store.ts`** — Uses `readDocument` / `writeDocument` for the PDF cache.
- **`config.ts`** — Reads `NODE_INVOICE_PDF_RETENTION_DAYS` to decide whether to cache at all.
- **`model.ts`** — Imports `InvoiceDocument` and `CreditNoteDocument` types for its public signatures.
- **`logger.ts`** — Emits warnings when a cached read or write fails.
- **`services/index.ts`** — Re-exports the public functions (`renderInvoicePdf`, `renderCreditNotePdf`, `storedDocumentName`).
- **`tests/unit/render.test.ts`** — Unit tests for the render, storage, and fallback logic.

## Notes

- **PII boundary:** `sharedFields` is the only place in the codebase that decrypts the stored billing address. Any new code that needs the plaintext must go through this path.
- **Retention `0`** disables caching entirely — every download triggers a fresh render.
- **Concurrent first downloads** are safe: both threads render, both write the same bytes, and the store's write is atomic. No lock is taken.
- **Failures are non-fatal by design:** a read error falls back to rendering; a write error returns the bytes anyway. Neither case propagates an exception to the caller.
- **Stryker mutation-testing disables** are present on the two `catch`/`then` error handlers; remove them only if those lines are actually tested.
