---
source: src/modules/invoicing/openapi.yaml
sha256: edb15ffc81c1ed6e24ff6c6069e2136d16f8431028730bb32bf5f4470e52850f
generated_at: 2026-11-08T06:12:19.531838+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/openapi.yaml

## Purpose

Module-level OpenAPI 3.1 contract for the invoicing domain. It defines the public API surface for downloading frozen invoice and credit-note PDFs, listing an order's credit notes, and declares the invoicing section that the data-export bundler appends to `POST /account/export`. It exists so that clients, generated SDKs, and AI assistants have a single normative source for this module's endpoints, error semantics, and schema shapes.

## Key elements

- **Tag `Invoicing`** (`x-family: Buying`) — all three operations file under it; describes the frozen, never-re-rendered PDF documents.
- **`x-error-codes`** (top-level) — module-wide error identifiers: `ORDER_INVOICE_NOT_ISSUED` (404) and `ORDER_CREDIT_NOTE_NOT_ISSUED` (404).
- **`x-personal-data.invoicing`** — contract for the invoicing slice of `POST /account/export`; requires `invoices[]` and `creditNotes[]` (empty arrays, never absent).
- **`GET /orders/{id}/invoice`** (`getOrderInvoice`) — returns a binary PDF with `Content-Disposition: inline; filename="invoice-<number>.pdf"`; supports 401/404/429/503.
- **`GET /orders/{id}/credit-notes`** (`listOrderCreditNotes`) — returns `CreditNotesResponse` (oldest-first array of `CreditNoteSummary`); supports 401/404.
- **`GET /orders/{id}/credit-notes/{creditNoteId}`** (`getOrderCreditNote`) — returns a binary PDF with `Content-Disposition: inline; filename="credit-note-<number>.pdf"`; supports 401/404/429/503.
- **`CreditNoteSummary`** — one row in the credit-note list: `id`, `number`, `issuedAt`, `currency`, `grandTotal`, `refundId`.
- **`CreditNotesResponse`** — wrapper with a single `items` array of `CreditNoteSummary`.
- **`ExportInvoiceDocument`** — one row in the account export: `orderId`, `number`, `issuedAt`, `currency`, `grandTotal` (no line items or VAT breakdown).

## Relationships

- **`shared/contracts/openapi.root.yaml`** — Every parameter (`IdPathParam`), shared response (`Unauthorized`, `NotFound`, `TooManyRequests`, `ServiceUnavailable`), and value type (`Id`, `CurrencyCode`, `NonNegativeDecimalAmount`) is pulled in via `$ref` using the relative path `../../../shared/contracts/openapi.root.yaml`. This file never redefines those primitives.

## Notes

- **Deliberate 404 ambiguity.** An unknown/inaccessible order and a "not yet issued" document both return HTTP 404. The body error code differs (`orders.not-found` vs. `ORDER_INVOICE_NOT_ISSUED` / `ORDER_CREDIT_NOTE_NOT_ISSUED`), but the status line is the same by design so a client cannot probe for order existence.
- **Frozen documents, not live renders.** Invoices and credit notes are written once (at `pending → paid` transition or at refund settlement) and are never re-rendered from current config. The 503 response applies only when a render slot is busy; a stored copy never triggers it.
- **`x-cache: no-store`** appears on both PDF-download operations but **not** on the credit-note list endpoint.
- **Rate limiting.** A comment notes `invoicingLimiter` guards the invoice/credit-note routes (see `routes.ts`); the 429 response is declared but the limiter logic lives outside this file.
- **`x-personal-data` is a bundler contract, not a path.** It is metadata the export bundler reads to assemble `AccountExportResponse`; removing this key (and the module) removes the section from the export without any code change in the export handler.
- **Credit-note list access control is implicit.** The endpoint returns 404 (not 403) when the caller lacks `display:Payment`; the spec does not enumerate this as a distinct error code.
