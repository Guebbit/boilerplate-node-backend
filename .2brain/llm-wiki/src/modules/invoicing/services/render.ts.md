---
source: src/modules/invoicing/services/render.ts
sha256: a85ec5cb661cb87f7c991a7b780bb54d36029b4a437f06fafb87b9a60f707ed9
generated_at: 2026-11-14T20:13:57.098626+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/services/render.ts

## Purpose

The single entry point that turns a frozen `InvoiceDocument` or `CreditNoteDocument` into PDF bytes. Controllers never resolve the e-invoicing provider port themselves; they call one of this file's two exports and receive a `Buffer`. Rendering is deferred to the **first** download (not issue time) and the result is cached on disk, making the stored PDF a regenerable copy of the Mongo source of truth.

## Key elements

- **`renderInvoicePdf(invoice)`** *(exported)* — Returns the invoice's PDF bytes. Reads the cached copy if one exists, otherwise renders via the provider and stores the result.
- **`renderCreditNotePdf(creditNote)`** *(exported)* — Same flow for a credit note; additionally passes `reversalOf` (the original invoice number) to the provider.
- **`storedDocumentName(kind, id)`** *(exported)* — Builds the deterministic storage key, e.g. `invoice-<id>.pdf` or `credit-note-<id>.pdf`.
- **`sharedFields(document, kind)`** *(internal)* — Projects the document into the `EInvoicingDocument` shape the provider expects. The **only** place the encrypted billing address is decrypted (via `decryptInvoiceParty`).
- **`storedOrRendered(name, render)`** *(internal)* — Orchestrates the read → fallback-render → best-effort-store sequence. Skips storage entirely when `NODE_INVOICE_PDF_RETENTION_DAYS` is `0`.
- **`readStored(name)`** *(internal)* — Wraps `readDocument` so a read failure logs a warning and resolves `undefined` instead of rejecting.
- **`storeBestEffort(name, bytes)`** *(internal)* — Wraps `writeDocument` so a write failure logs a warning but still resolves the bytes.

## Relationships

- **`src/modules/invoicing/providers/index.ts`** — Calls `resolveEInvoicingProvider().render(...)` to actually produce the PDF. This file is the sole caller of the provider port in the invoicing module.
- **`src/infrastructure/adapters/document-store.ts`** — Uses `readDocument` / `writeDocument` for the on-disk PDF cache.
- **`src/modules/invoicing/pii.ts`** — Calls `decryptInvoiceParty` to obtain the plaintext billing address; imports the `InvoiceDocumentKind` union type.
- **`src/modules/invoicing/model.ts`** — Imports `InvoiceDocument` and `CreditNoteDocument` types.
- **`src/modules/invoicing/config.ts`** — Reads `NODE_INVOICE_PDF_RETENTION_DAYS` to decide whether to cache.
- **`src/infrastructure/adapters/logger.ts`** — Emits warnings on read/store failures.
- **`src/modules/invoicing/services/index.ts`** — Barrel re-export surface for this module.
- **`src/modules/invoicing/tests/unit/render.test.ts`** — Unit tests covering the render, store, and fallback paths.

## Notes

- **Fault tolerance is one-directional:** both read and store failures are swallowed (logged + fallback). A download never 500s because of the cache layer.
- **Concurrent first downloads** of the same document both render; this is safe because the render is deterministic (same frozen row) and the store write is atomic.
- **`retentionDays === 0`** is a valid config meaning "never cache, always render fresh."
- **`sharedFields` is the sole decryptor** of the billing address — do not add another plaintext reader elsewhere without going through this function.
- **Stryker mutation-testing disables** are present on the two `logger.warn` lines, meaning those log calls are excluded from mutation coverage expectations.
