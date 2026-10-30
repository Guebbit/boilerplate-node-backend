---
source: src/modules/invoicing/controllers/get-order-invoice.ts
sha256: dae72565766786ef27769cffcab6a7d630b2ad9106df39f29a90d2af8df9c4e8
generated_at: 2026-10-29T04:10:35.275245+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/controllers/get-order-invoice.ts

## Purpose

HTTP handler for `GET /orders/:id/invoice`. Resolves the caller's invoice (either a stored document or a fresh render), records a staff-read audit event, and streams the PDF bytes back. Returns `200` with the PDF, `404` if the order is unknown or has no invoice, or `500` if rendering fails.

## Key elements

- **`getOrderInvoice`** (exported) – Express handler accepting `Request<{ id?: string }>` and `Response`. Validates the route param, calls the invoicing service for the caller, audits the view, renders (if needed), and sends the PDF.

## Relationships

- **`src/infrastructure/http/controller.ts`** – Provides `catchAs` (wraps promise rejections into a 500) and `refused` (short-circuits with a 403 when the service denies access).
- **`src/infrastructure/http/ids.ts`** – `requireId` extracts and validates the `:id` route param; returns early with a 404 if missing/malformed.
- **`src/modules/invoicing/services/index.ts`** – `invoicingService.invoiceForCaller(id, authContext)` resolves the invoice for the caller; `invoicingService.renderInvoicePdf(invoice)` produces the PDF bytes.
- **`src/modules/invoicing/controllers/send-pdf.ts`** – `sendPdf(response, filename, bytes)` sets headers and writes the binary body.
- **`src/modules/invoicing/audit.ts`** – `invoicingAuditActions.ADMIN_INVOICE_VIEWED` supplies the audit-action constant for the staff-read record.
- **`src/kernel/staff-read.ts`** – `recordStaffRead(request, …)` persists an audit row tied to the viewing staff member.
- **`src/modules/orders/index.ts`** – `buyerIdOf(order)` yields the buyer's id used as `ownerId` in the audit record.
- **`src/modules/invoicing/routes.ts`** – Registers `getOrderInvoice` as the handler for the `GET /orders/:id/invoice` route.

## Notes

- **Audit `targetId` is the Mongo `_id`, not the invoice number.** Both the invoice and credit-note number series restart at 1 each year; the audit filter (`GET /audit?target=`) matches on `targetId` alone, so using the number would be ambiguous.
- A `404` is returned both when the order does not exist and when the order exists but has no invoice (e.g. never paid, or a failed freeze that does not roll back the payment).
- A `500` is the expected outcome on deployments with `INSTALL_CHROMIUM=false`, where PDF rendering is impossible.
