---
source: src/modules/invoicing/controllers/get-order-invoice.ts
sha256: 090c4f8babc5a3f3bfe33967d0196007d7aec62a5c1b7e6a615260ffa9fe73a9
generated_at: 2026-11-14T20:11:46.896179+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/controllers/get-order-invoice.ts

## Purpose

HTTP handler for `GET /orders/:id/invoice`. Resolves the caller's invoice for an order, renders the PDF (served from storage or generated on the fly), and streams the bytes back. Enforces that non-admin callers only access their own order's invoice.

## Key elements

- **`getOrderInvoice(request, response)`** — The sole export. Validates the `:id` param, calls the invoicing service for the caller's invoice, logs a staff-read audit entry, renders the PDF, and sends it with a filename of `invoice-<number>.pdf`.
- **Response codes** — `200` (invoice exists and rendered), `404` (order missing, never invoiced, or failed freeze that never rolled back the payment), `500` (PDF render failure, e.g. `INSTALL_CHROMIUM=false` deployment).

## Relationships

- **`src/modules/invoicing/services/index.ts`** — Exports `invoicingService`; this file calls it to resolve the caller's invoice (with authorization) and to render the PDF bytes.
- **`src/modules/invoicing/controllers/send-pdf.ts`** — Delegates the final byte-stream and `Content-Type`/`Content-Disposition` headers to `sendPdf`.
- **`src/modules/invoicing/audit.ts`** — Exports `invoicingAuditActions`; this file uses its `ADMIN_INVOICE_VIEWED` member as the action label in the audit record.
- **`src/kernel/staff-read.ts`** — Calls `recordStaffRead` to write the audit row (target `invoice`, subject = buyer).
- **`src/infrastructure/http/ids.ts`** — `requireId` extracts and validates `:id` before any DB access; returns early with 404 on failure.
- **`src/infrastructure/http/controller.ts`** — `refused` short-circuits the response on a 403/404 service result; `catchAs` maps unhandled rejects to a 500 JSON error.
- **`src/modules/orders/index.ts`** — Re-exports `buyerIdOf` (originating from `src/modules/orders/domain/rules.ts`) used to resolve the buyer's identity for the audit subject.
- **`src/modules/orders/domain/rules.ts`** — Source of `buyerIdOf`, imported via the `@modules/orders` barrel.
- **`src/modules/invoicing/routes.ts`** — Wires this handler onto the `GET /orders/:id/invoice` route.

## Notes

- **`targetId` is the row `_id`, not the invoice number.** Both the invoice and credit-note series restart at 1 each year, and `GET /audit?target=` filters on `targetId` alone, so the number would be ambiguous.
- **Failed freeze never rolls back the payment**, yet the invoice is absent — hence the 404. Don't treat 404 as "payment never occurred."
- The handler runs PDF rendering synchronously on the request thread (no background job). In Chromium-less deployments this will 500.
