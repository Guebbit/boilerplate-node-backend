---
source: src/modules/invoicing/controllers/get-order-credit-note.ts
sha256: 51e74d8a9990475090d25ae831d37a40376c9143ab644e44ae318e0c7eeb3147
generated_at: 2026-11-14T20:11:20.383758+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/controllers/get-order-credit-note.ts

## Purpose

HTTP controller that serves the PDF credit note for a given order. It is the credit-note counterpart to `get-order-invoice`: it returns `200` with the rendered PDF when the caller is authorised, `404` when the order or credit note does not exist (or belongs to another order), and `500` on render failure.

## Key elements

- **`getOrderCreditNote`** (exported) – Express handler for `GET /orders/:id/credit-notes/:creditNoteId`. Validates the order id, resolves the credit note via the invoicing service, records a staff-read audit event, renders the PDF, and streams it to the response.

## Relationships

- **`src/infrastructure/http/ids.ts`** – `requireId` validates the `:id` path parameter and short-circuits with a 404 when absent.
- **`src/infrastructure/http/controller.ts`** – `refused` converts an access-denial result into an HTTP error response; `catchAs` maps thrown/rejected errors to a 500.
- **`src/infrastructure/http/request.ts`** – `callerContextOf` extracts the caller's context from the request for the service call.
- **`src/modules/invoicing/services/index.ts`** – provides the `invoicingService` instance used to fetch/authorise the credit note and to render it as a PDF buffer.
- **`src/kernel/staff-read.ts`** – `recordStaffRead` logs the staff-viewing audit event.
- **`src/modules/invoicing/audit.ts`** – supplies the audit action constants used in the staff-read record.
- **`src/modules/invoicing/controllers/send-pdf.ts`** – `sendPdf` sets response headers and writes the PDF bytes.
- **`src/modules/invoicing/routes.ts`** – registers this handler on the Express route table.
- **`src/modules/orders/index.ts`** – `buyerIdOf` resolves the buyer identifier from the order for the audit subject.

## Notes

- The audit `targetId` is deliberately the credit note's **`_id`** (row identifier), not its `number`, because the number repeats across the invoice series and would be ambiguous for audit lookups.
- Access is two-tiered: non-admin callers only see credit notes on their own orders; staff additionally require the "payments staff read" permission (enforced inside the service).
- The module doc comment positions this file as the structural twin of `get-order-invoice.ts`; the two controllers share the same shape and helper set, differing only in the service methods and output file name.
