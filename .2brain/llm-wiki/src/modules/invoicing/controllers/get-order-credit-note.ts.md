---
source: src/modules/invoicing/controllers/get-order-credit-note.ts
sha256: 630b0d924848a65011d4495230ab403bf722af7822c60bb45d59bc277499931d
generated_at: 2026-10-29T04:10:14.044143+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/controllers/get-order-credit-note.ts

## Purpose

HTTP controller that serves the PDF of an order's credit note (a landed refund) at `GET /orders/:id/credit-notes/:creditNoteId`. Explicitly documented as the twin of `getOrderInvoice`: it returns `200` with the rendered PDF, `404` when the credit note does not exist, belongs to a different order, or the caller lacks access, and `500` on a render failure.

## Key elements

- **`getOrderCreditNote`** (exported) — Express handler. Validates the order id, resolves the credit note for the caller via `invoicingService.creditNoteForCaller`, records a staff-read audit entry, renders the PDF via `invoicingService.renderCreditNotePdf`, and streams it with `sendPdf`.

## Relationships

- **`@modules/orders`** — imports `buyerIdOf` to derive the owner id for the audit log.
- **`../services` (`invoicingService`)** — calls `creditNoteForCaller` (authorisation + lookup) and `renderCreditNotePdf` (binary generation).
- **`@infrastructure/http/ids`** — `requireId` validates/extracts the `:id` route param.
- **`@infrastructure/http/controller`** — `catchAs` converts unexpected errors to a `500` response; `refused` short-circuits on `403`/`404` results.
- **`@infrastructure/http/request`** — `callerContextOf` builds the caller context passed into `creditNoteForCaller`.
- **`@kernel/staff-read`** — `recordStaffRead` logs that a staff member viewed the credit note.
- **`../audit`** — supplies the `invoicingAuditActions.ADMIN_CREDIT_NOTE_VIEWED` action constant used in the audit record.
- **`./send-pdf`** — `sendPdf` streams the rendered buffer to the HTTP response with a `content-disposition` filename.
- **`../routes`** — registers this handler on the credit-note route.

## Notes

- The audit `targetId` is the credit-note **row id** (`_id`), not the human-readable `number`; the in-code comment explains that the number can repeat across the invoice series.
- Access control is two-tiered: non-admin callers are scoped to their own order; staff additionally require the *payments* staff-read permission (enforced inside `creditNoteForCaller`, not in this file).
- The handler is a plain function (not a class method), consistent with the sibling `getOrderInvoice` controller.
