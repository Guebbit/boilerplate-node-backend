---
source: src/modules/invoicing/controllers/get-order-invoice.ts
source_sha256: 09b7a76687a111ecc6e278637f5ebabf66e65a7cd615b2fadc76fec4a2023b86
context_sha256: 0814df050f4125651ebeb354f89c89ba7b7c7604006114b909a018c8b659c4b3
generated_at: 2026-11-22T05:30:06.256710+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/invoicing/controllers/get-order-invoice.ts

## Purpose
Express controller for `GET /orders/:id/invoice`. It serves the invoice PDF for an order: the stored PDF, or one rendered on the request thread when none is stored. Responses are `200` once the order has been invoiced, `404` for an order with no invoice yet (never paid, or a failed freeze, which never rolls back the payment) or one that does not exist, and `500` on a render failure (for example an `INSTALL_CHROMIUM=false` deployment).

## Key elements
- `getOrderInvoice(request, response)` — the exported handler.
  - It validates `:id` with `requireId`, answering `orders.not-found` for an unusable id before any query.
  - It calls `invoicingService.invoiceForCaller(id, request.authContext)`. Non-admin callers see only their own order's invoice.
  - If `refused(response, result)` is true, it stops, since the refusal has already been written to the response.
  - Otherwise it records a staff read, calls `invoicingService.renderInvoicePdf(invoice)`, and streams the result with `sendPdf` as `invoice-<number>.pdf`.
  - Any rejection goes to `catchAs(response, 'Invoice generation failed')`.

## Relationships
- `src/infrastructure/http/ids.ts` (`requireId`) — validates the route id.
- `src/infrastructure/http/controller.ts` (`refused`, `catchAs`) — handles refusal results and maps errors to responses.
- `src/modules/invoicing/services/index.ts` (`invoicingService`) — provides `invoiceForCaller`, which returns `{ document, order }`, and `renderInvoicePdf`.
- `src/modules/orders/index.ts` (`buyerIdOf`) — derives the buyer id from the order, used as the audit `subjectId`.
- `src/kernel/staff-read.ts` (`recordStaffRead`) — writes the audit entry, with key `display:Order`.
- `src/modules/invoicing/audit.ts` (`invoicingAuditActions`) — supplies the audit action constant used for the entry.
- `src/modules/invoicing/controllers/send-pdf.ts` (`sendPdf`) — sends the PDF bytes with the filename.
- `src/modules/invoicing/routes.ts` — presumably mounts this handler; the file itself does not show it.

## Notes
- The audit `targetId` is `String(invoice._id)`, the row id rather than the invoice number. The invoice and credit-note series both restart at 1 each year, and `GET /audit?target=` filters on `targetId` alone.
- The audit entry is recorded before rendering, so it is written even if rendering then fails.
- The audit target type is `'invoice'`.
