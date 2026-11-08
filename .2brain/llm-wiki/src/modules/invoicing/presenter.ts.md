---
source: src/modules/invoicing/presenter.ts
sha256: 809ade406f7c77e3ca95360158003a62e50d7021e2a672ffa0bfb97abdda734b
generated_at: 2026-11-08T06:12:45.172748+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/presenter.ts

## Purpose

The single serialization point for the invoicing module's frozen documents into JSON wire shapes. It powers the `POST /account/export` response section and the per-order credit-note list. Every other read endpoint in this module serves rendered PDFs, never the raw document—this file is the exception.

## Key elements

- **`ExportedDocument`** (interface) — the wire shape for one issued document (invoice or credit note) inside the export envelope. Exposes `orderId`, `number`, `issuedAt`, `currency`, and a pre-padded `grandTotal` string.
- **`presentExportedDocument(document)`** — maps an `InvoiceDocument` or `CreditNoteDocument` to `ExportedDocument`. Stringifies `orderId`, passes `number`/`issuedAt`/`currency` through, and formats `grandTotal` via `padDecimal`.
- **`presentCreditNoteSummary(creditNote)`** — maps a `CreditNoteDocument` to the `CreditNoteSummary` type expected by the credit-note list. Stringifies `_id`, serialises `issuedAt` to ISO-8601, pads `grandTotal`, and carries `refundId`.

## Relationships

- **`src/modules/invoicing/model.ts`** — source of the `InvoiceDocument` and `CreditNoteDocument` input types consumed by both presenters.
- **`src/domain-primitives/money.ts`** — provides `padDecimal`, used to render `grandTotal` as a currency-aware decimal string in both outputs.
- **`src/types/index.ts`** — source of the `CreditNoteSummary` return type for `presentCreditNoteSummary`.
- **`src/modules/invoicing/controllers/get-order-credit-notes.ts`** — downstream consumer that calls `presentCreditNoteSummary` to build its response rows.

## Notes

- The module docstring is explicit: this is the **only** place a frozen document is emitted as JSON. If you need a document for display, go to `get-order-invoice.ts` or `get-order-credit-note.ts` (PDF renderers), not here.
- `presentExportedDocument` intentionally accepts a union of both document types; it relies on structural overlap (`orderId`, `number`, `issuedAt`, `currency`, `grandTotal`) rather than checking a discriminator.
- `presentCreditNoteSummary` reads `_id` while `presentExportedDocument` reads `orderId`—the two document shapes differ in their identity field.
