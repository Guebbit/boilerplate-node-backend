---
source: src/modules/invoicing/openapi.yaml
sha256: dde6e405b7272910079266253ebededcad64146e2b1b37362a2d3f08b93f74d5
generated_at: 2026-11-14T20:12:11.597768+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/openapi.yaml

## Purpose

OpenAPI 3.1.0 contract for the **invoicing** module. It defines the three order-scoped endpoints (download invoice PDF, list credit notes, download a credit-note PDF), the module's error-code vocabulary, and the `invoicing` section the bundler injects into `POST /account/export`. It is the single source of truth for what the invoicing API exposes and how errors/limits are signalled.

## Key elements

- **`GET /orders/{id}/invoice`** (`getOrderInvoice`) — Returns the frozen invoice PDF issued at the `pending → paid` transition. Server names the file via `Content-Disposition`. Rate-limited (`429`); returns `503` + `Retry-After` when the render queue is saturated.
- **`GET /orders/{id}/credit-notes`** (`listOrderCreditNotes`) — Unpaged list of `CreditNoteSummary` rows (one per settled refund, oldest first). Empty array when the order was never refunded or the caller lacks `display:Payment`.
- **`GET /orders/{id}/credit-notes/{creditNoteId}`** (`getOrderCreditNote`) — Downloads a single credit-note PDF. Same 429/503 behaviour as the invoice route.
- **`x-error-codes`** — `ORDER_INVOICE_NOT_ISSUED` (404) and `ORDER_CREDIT_NOTE_NOT_ISSUED` (404); both intentionally indistinguishable from a plain "order not found" to the client.
- **`x-personal-data.invoicing`** — Declares the module's export slice (`invoices` + `creditNotes` arrays of `ExportInvoiceDocument`). Removed automatically if the module is removed.
- **Schemas** — `CreditNoteSummary`, `CreditNotesResponse`, `ExportInvoiceDocument`. All are deliberately *summaries* (number, amount, currency, date); the frozen document body (line items, VAT, seller identity) lives only in the PDF.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — All cross-module `$ref`s resolve here: the shared `Id` / `IdPathParam` / `CurrencyCode` / `NonNegativeDecimalAmount` schemas and the canonical `Unauthorized`, `NotFound`, `TooManyRequests`, `ServiceUnavailable` responses. This file contributes no shared components back; it only consumes them.

## Notes

- Invoices are **frozen at issue time**; the endpoint never re-renders from current config. A `404` means "not invoiced yet" (never paid, or the invoice listener failed), not a missing record.
- Credit-note `404` collapses three cases (non-existent, wrong order, insufficient permission) into one status + code — by design, to avoid leaking existence.
- PDF endpoints carry `x-cache: no-store`; the list endpoint does not.
- The `503` path is specific: all render slots busy **and** the bounded queue full. A cached/stored PDF never hits this.
- The export schema is a strict subset of the download response; do not add line-item fields there.
