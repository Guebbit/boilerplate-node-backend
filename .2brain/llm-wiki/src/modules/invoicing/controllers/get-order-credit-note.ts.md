---
source: src/modules/invoicing/controllers/get-order-credit-note.ts
sha256: f1dd15495f067f0e42c149f0cb07abf6a00dacabbfc98c51166e2890e153ec89
generated_at: 2026-10-14T16:05:04.010494+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/controllers/get-order-credit-note.ts

## Purpose

Serves the PDF credit note for a specific order (i.e. a confirmed refund). It is the credit-note counterpart of the order-invoice controller: returns a `200` with the rendered PDF, a `404` when the credit note was never issued, belongs to a different order, or the order itself is absent/invisible to the caller, and a `500` if PDF rendering fails.

## Key elements

- **`getOrderCreditNote`** (exported) — Express handler for `GET /orders/:id/credit-notes/:creditNoteId`. Resolves the order via `orderService.getForCaller` (enforcing caller visibility), validates the `creditNoteId` param, looks up the credit note through `invoicingService.findCreditNoteForOrderById`, renders it with `invoicingService.renderCreditNotePdf`, and streams the PDF back with appropriate headers.
- **`notIssued`** (module-local) — Sends a `404` with the `ORDER_CREDIT_NOTE_NOT_ISSUED` error code and an i18n-translated message. Used for both "never issued" and "belongs to another order" cases (deliberate non-disclosure).

## Relationships

- **`@infrastructure/http/controller`** — provides `catchAs`, which wraps the entire promise chain so an unhandled error yields a `500` "Credit note generation failed" response.
- **`@infrastructure/http/ids`** — `requireId` extracts and validates the `:id` path param (order id); `isValidObjectId` checks the `creditNoteId` param against the caller in a way that does not leak ID-format validity.
- **`@infrastructure/http/response`** — `rejectResponse` is the standardised helper for sending structured error bodies.
- **`@infrastructure/i18n`** — `t` translates user-facing error and message strings.
- **`@modules/orders`** — `orderService.getForCaller` loads the order scoped to the authenticated caller (non-admin callers only see their own orders).
- **`../services` (invoicing service)** — `findCreditNoteForOrderById` retrieves the credit note document; `renderCreditNotePdf` produces the binary PDF.
- **`src/modules/invoicing/routes.ts`** — registers the `GET /orders/:id/credit-notes/:creditNoteId` route that dispatches to this controller.

## Notes

- **`creditNoteId` is intentionally not passed through `requireId`.** It is only checked with `isValidObjectId` *after* the caller has been confirmed to see the order. This ensures a malformed or foreign `creditNoteId` always yields the same "not issued" 404 rather than a distinct "bad ID" response, preventing ID-enumeration.
- The PDF is sent with `Content-Disposition: inline` (browser displays it) and `Cache-Control: private, no-store` (no client-side or proxy caching).
- The module doc-comment explicitly names `get-order-invoice` as its twin; the two controllers share the same URL shape and status-code contract but differ in the service methods they call.
