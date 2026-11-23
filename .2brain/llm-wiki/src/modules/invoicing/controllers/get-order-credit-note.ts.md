---
source: src/modules/invoicing/controllers/get-order-credit-note.ts
source_sha256: 51e74d8a9990475090d25ae831d37a40376c9143ab644e44ae318e0c7eeb3147
context_sha256: 32eca068c8fc63a082607a1146f6edc25a8431416666a1cd8ce2047d961edd6e
generated_at: 2026-11-22T05:29:40.089798+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/invoicing/controllers/get-order-credit-note.ts

## Purpose
Express controller that serves the PDF of a credit note for an order (`GET /orders/:id/credit-notes/:creditNoteId`). It is the credit-note twin of `getOrderInvoice`. It returns `200` with the PDF when the order has that credit note, `404` when the credit note was never issued, belongs to another order, or the order doesn't exist, and `500` on a render failure.

## Key elements
- `getOrderCreditNote(request, response)` is the only export, and it is the request handler.
  - It validates the `:id` param with `requireId`, using the `orders.not-found` error key. If validation fails it returns early.
  - It calls `invoicingService.creditNoteForCaller(id, creditNoteId, request.authContext, callerContextOf(request))`. Per its doc comment, non-admin callers see only their own order's credit note, and staff need the payments staff read.
  - If `refused(response, result)` is true, it stops. The refusal response is sent by that helper.
  - On success it destructures `{ document: creditNote, order }` from `result.data`.
  - It records a staff read via `recordStaffRead` with these fields:
    - key `display:Order`
    - action `invoicingAuditActions.ADMIN_CREDIT_NOTE_VIEWED`
    - target type `credit_note`
    - target id `String(creditNote._id)`
    - subject id `buyerIdOf(order)`
  - It renders the PDF with `invoicingService.renderCreditNotePdf(creditNote)`, then sends it with `sendPdf(response, \`credit-note-${creditNote.number}.pdf\`, pdf)`.
  - Any rejection goes to `catchAs(response, 'Credit note generation failed')`.

## Relationships
- `src/infrastructure/http/ids.ts` supplies `requireId`, which validates the order id.
- `src/infrastructure/http/controller.ts` supplies `refused`, which turns a refused service result into a response, and `catchAs`, which is the error handler.
- `src/infrastructure/http/request.ts` supplies `callerContextOf`, which builds the caller context passed to the service.
- `src/modules/invoicing/services/index.ts` supplies `invoicingService`, which does the authorization-aware lookup (`creditNoteForCaller`) and the PDF rendering (`renderCreditNotePdf`).
- `src/modules/orders/index.ts` supplies `buyerIdOf`, used to set the audit `subjectId`.
- `src/kernel/staff-read.ts` supplies `recordStaffRead`, which writes the staff-read audit entry.
- `src/modules/invoicing/audit.ts` supplies the `invoicingAuditActions` constant used for the audit action (`ADMIN_CREDIT_NOTE_VIEWED`).
- `src/modules/invoicing/controllers/send-pdf.ts` supplies `sendPdf`, which writes the PDF to the response under the given filename.
- `src/modules/invoicing/routes.ts` is a graph neighbor and is presumably where this handler is mounted.

## Notes
- The audit `targetId` is the credit note's row `_id`, not its number, because the number repeats across the invoice series.
- The audit entry is recorded before rendering, so a render failure still leaves a staff-read record while the client gets a `500`.
- The handler returns the promise chain, but no code outside the chain (such as the early `requireId` return) awaits it.
