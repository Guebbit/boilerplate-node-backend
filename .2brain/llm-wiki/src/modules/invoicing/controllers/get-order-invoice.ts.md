---
source: src/modules/invoicing/controllers/get-order-invoice.ts
sha256: 739b74565451e9fcfa8fbbe25bcd8e9ac966d056aaa1a87e7b031157761fcea2
generated_at: 2026-10-14T16:05:40.521432+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/controllers/get-order-invoice.ts

## Purpose

HTTP handler for `GET /orders/:id/invoice`. Resolves the caller's order, locates its invoice, renders a PDF synchronously on the request thread, and streams the bytes back. Exists to give the frontend a single endpoint that returns the invoice file or a structured 404 explaining why one isn't available.

## Key elements

- **`getOrderInvoice(request, response)`** — The sole export. Full pipeline:
  1. Validates the `:id` route param via `requireId` (early 404 if missing/malformed).
  2. Calls `orderService.getForCaller(id, authContext)` — scopes visibility to the caller.
  3. Calls `invoicingService.findInvoiceForOrder` to locate the invoice record.
  4. Records a staff-read audit event (`recordStaffRead`).
  5. Calls `invoicingService.renderInvoicePdf` and sends the resulting Buffer with `200`.
  6. Falls through to a 500 via `catchAs` if rendering throws.

## Relationships

- **`@modules/orders`** (`orderService`) — fetches the order with caller-scoped visibility.
- **`../services`** (`invoicingService`) — provides `findInvoiceForOrder` and `renderInvoicePdf`.
- **`@infrastructure/http/ids`** (`requireId`) — parses and validates the route ID param.
- **`@infrastructure/http/response`** (`rejectResponse`) — emits structured 404 bodies.
- **`@infrastructure/http/controller`** (`catchAs`) — wraps the promise `.catch` into a 500 response.
- **`@infrastructure/i18n`** (`t`) — translates user-facing error messages.
- **`@kernel/staff-read`** (`recordStaffRead`) — writes the audit-log entry for the view.
- **`../audit`** (`invoicingAuditActions`) — supplies the `ADMIN_INVOICE_VIEWED` action constant.
- **`../routes.ts`** — registers this handler on the Express router for the invoice path.

## Notes

- Rendering is **synchronous on the request thread** (puppeteer/Chromium). Deployments with `INSTALL_CHROMIUM=false` will 500 on this endpoint.
- `Content-Disposition` is deliberately `inline`, not `attachment`, so the frontend can preview the PDF in the same tab before offering a download.
- `Cache-Control: private, no-store` is set because the document contains personal and financial data.
- A 404 with `ORDER_INVOICE_NOT_ISSUED` can occur even for a *paid* order if the freeze step failed (a failed freeze does not roll back the payment). The response body carries the machine-readable error code alongside the translated message.
- Non-admin callers can only retrieve their own order's invoice; that scoping lives in `orderService.getForCaller`, not in this controller.
