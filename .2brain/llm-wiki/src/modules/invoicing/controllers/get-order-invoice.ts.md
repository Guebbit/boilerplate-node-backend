---
source: src/modules/invoicing/controllers/get-order-invoice.ts
sha256: dae72565766786ef27769cffcab6a7d630b2ad9106df39f29a90d2af8df9c4e8
generated_at: 2026-11-08T06:10:00.816581+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/controllers/get-order-invoice.ts

## Purpose

HTTP handler for `GET /orders/:id/invoice`. Resolves the caller's permission to view the invoice, renders the PDF (from stored bytes or on the request thread), and streams it back. Returns `200`, `404` (order missing or never invoiced), or `500` (render failure).

## Key elements

- **`getOrderInvoice(request, response)`** — the sole export. Validates the `:id` param, calls `invoicingService.invoiceForCaller` (scope-checks admin vs. buyer), records a staff-read audit event, renders the PDF via `invoicingService.renderInvoicePdf`, and streams it with `sendPdf`. Filename is `invoice-<number>.pdf`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/infrastructure/http/ids.ts` | `requireId` validates the `:id` route param and short-circuits with a 404 if absent/malformed. |
| `src/infrastructure/http/controller.ts` | `refused` maps service-level denial to an HTTP 403; `catchAs` turns any thrown error into a 500 JSON response. |
| `src/modules/invoicing/services/index.ts` | `invoicingService.invoiceForCaller` (permission + fetch) and `invoicingService.renderInvoicePdf` (PDF generation). |
| `src/modules/orders/index.ts` | `buyerIdOf(order)` extracts the buyer id for the audit `ownerId` field. |
| `src/kernel/staff-read.ts` | `recordStaffRead` writes the "invoice viewed" audit entry. |
| `src/modules/invoicing/audit.ts` | `invoicingAuditActions.ADMIN_INVOICE_VIEWED` provides the action label for that audit entry. |
| `src/modules/invoicing/controllers/send-pdf.ts` | `sendPdf` sets headers and pipes the PDF buffer to the response. |
| `src/modules/invoicing/routes.ts` | Wires this handler to the `GET /orders/:id/invoice` route (registration lives there, not in this file). |

## Notes

- **`targetId` is the Mongo row id, not the human-facing number.** Both invoice and credit-note series restart at 1 each year; `GET /audit?target=` filters on `targetId` alone, so the number would be ambiguous.
- **404 is overloaded.** It covers "order does not exist" *and* "order exists but has no invoice yet" (never paid, or a failed freeze that never rolled back the payment). There is no distinct status for the latter.
- **Render failure mode:** a deployment with `INSTALL_CHROMIUM=false` will produce a 500 every time the PDF is not already stored.
- **Scope enforcement is in the service, not the controller.** `invoiceForCaller` decides whether a non-admin may see the order; the controller only translates the result into HTTP.
