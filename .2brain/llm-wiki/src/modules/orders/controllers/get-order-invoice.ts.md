---
source: src/modules/orders/controllers/get-order-invoice.ts
sha256: 1dcf830eb3008ccbac8e7fb948c36e95c773fb05a8491ed5bab40a122cef88b3
generated_at: 2026-09-23T19:00:15.289791+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/controllers/get-order-invoice.ts

## Purpose

Controller handler for `GET /orders/:id/invoice`. Renders an order's PDF invoice synchronously on the request thread via `orderService.renderInvoicePdf` and streams the raw bytes back. Returns `200` with the PDF, `404` if the order is missing or invisible to the caller, or `500` on render failure. There is no polling or background job: the invoice is a transient view of the order, not a durable artefact.

## Key elements

- **`getOrderInvoice`** (exported) — Express handler `(request, response) => void | Promise<void>`. Validates the `:id` param, fetches the order under the caller's scope, calls `renderInvoicePdf`, and sends the bytes with appropriate headers.

## Relationships

- **`src/modules/orders/services/index.ts`** — Supplies `orderService` and its three methods used here: `getById` (scoped lookup), `callerScope` (derives the query scope from `request.authContext`), and `renderInvoicePdf` (produces the PDF bytes).
- **`src/modules/orders/routes.ts`** — Registers this handler on the `GET /orders/:id/invoice` route.
- **`src/infrastructure/http/request.ts`** — Provides `isValidObjectId` for pre-query param validation.
- **`src/infrastructure/http/response.ts`** — Provides `rejectResponse` for the two 404 paths.
- **`src/infrastructure/http/controller.ts`** — Provides `catchAs`, which converts a thrown/rejected error into a `500` JSON response.
- **`src/infrastructure/i18n/index.ts`** (re-exported from **`src/infrastructure/i18n/context.ts`**) — Provides `t()` for the `orders.not-found` message key.

## Notes

- **Polymorphic order shape:** `getById` returns an `OrderDocument` (with `_id`) for admin-scope and a wire-shape `Order` (with `id`, no `_id`) for owner-scope. The controller distinguishes them with `'_id' in order` before passing the id to `renderInvoicePdf`.
- **Double 404 risk:** `renderInvoicePdf` performs its own `findByIdRaw`, so a hard-delete between the two lookups yields `null` and a second 404 path.
- **`Content-Disposition` is `inline`**, not `attachment` — the frontend decides between download and same-tab preview.
- **`Cache-Control: private, no-store`** is set because the invoice contains personal/financial data; it must not land in any shared, CDN, or disk cache.
- **Synchronous, no 202:** rendering happens on the request thread. A deployment with `INSTALL_CHROMIUM=false` will surface as a `500`.
- **Invalid-id check precedes the query** deliberately: the two role branches in the service raise different error classes for a malformed id, so the controller short-circuits with a uniform 404 first (same rationale as in `get-order-item.ts`).
