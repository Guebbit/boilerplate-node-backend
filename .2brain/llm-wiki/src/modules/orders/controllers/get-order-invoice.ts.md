---
source: src/modules/orders/controllers/get-order-invoice.ts
sha256: 77cc1b417e93645eb7abdf1e3a812f25fc4bd8094f4d1c529a47b1c581fd152f
generated_at: 2026-09-27T15:07:17.955459+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/controllers/get-order-invoice.ts

## Purpose

HTTP controller for `GET /orders/:id/invoice`. Synchronously renders an order's PDF invoice on the request thread via `orderService.renderInvoicePdf` and streams the bytes back as a `200` response. Returns `404` when the order is missing or inaccessible, and `500` on a render failure. The invoice is treated as a view of the order, not a durable artifact, so no async job pattern is used.

## Key elements

- **`getOrderInvoice`** (exported) – The sole controller function. Validates the `:id` param, scopes the order lookup to the caller, calls `renderInvoicePdf`, and sends the PDF bytes with appropriate headers.

## Relationships

- **`@infrastructure/http/request`** – `isValidObjectId` guards the route param before any database call, ensuring a malformed id yields a `404` rather than a `422` from the query layer.
- **`@infrastructure/http/response`** – `rejectResponse` builds the `404` JSON error body (with an i18n message).
- **`@infrastructure/http/controller`** – `catchAs` converts any thrown/render-failure error into a `500` JSON response.
- **`@infrastructure/i18n`** – `t` resolves the `orders.not-found` and generic error strings.
- **`src/modules/orders/services/index.ts`** – `orderService.getById` (scoped by `callerScope`), `orderService.renderInvoicePdf` (the actual PDF generation).
- **`src/modules/orders/routes.ts`** – Registers this handler on the `GET /orders/:id/invoice` route.

## Notes

- **Synchronous render, no 202/polling.** The PDF is generated inline on the request thread. A deployment with `INSTALL_CHROMIUM=false` will surface as a `500` through `catchAs`.
- **`Content-Disposition: inline`, not `attachment`.** The frontend receives the blob and decides whether to download or preview in-tab; the server does not force a save dialog.
- **`Cache-Control: private, no-store`.** Invoices contain personal/financial data; they must never land in a shared/CDN cache or the browser's disk cache.
- **Two independent lookups.** `getById` and the render's internal `findByIdRaw` are separate queries; the code handles the (vanishingly rare) case where the document is hard-deleted between them by returning `404` if `renderInvoicePdf` resolves to falsy.
- **Filename fallback.** `order.orderNumber` is preferred for the `filename` header; if absent, the raw `_id` string is used.
