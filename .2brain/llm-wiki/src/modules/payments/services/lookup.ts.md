---
source: src/modules/payments/services/lookup.ts
sha256: 487f49d8a5aeb78c20dc0857644703596f17a3b7da5220a0d672893223789378
generated_at: 2026-10-15T11:30:26.823909+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/lookup.ts

## Purpose

Resolves an RF (bank transfer) reference to the order it pays. It is the single lookup step in front of the existing `POST /payments/order/{orderId}/offline` settlement endpoint; no settlement logic lives here.

## Key elements

- **`getOrderByReference(ref: string)`** — The sole export. Parses the raw reference with `parseReference`, queries `orderService.getByTransferReference`, and returns either `generateSuccess(order)` or a `404` reject. Both a malformed reference and a valid-but-unmatched one yield the identical 404 payload.

## Relationships

- **`@infrastructure/http/response`** — Uses `generateSuccess` / `generateReject` and the `ResponseSuccess` / `ResponseReject` types to shape the HTTP response.
- **`@infrastructure/i18n`** — Imports `t` to produce the localised error message (`payments.order-not-found`).
- **`@modules/orders`** (barrel: `index.ts`) — Consumes `orderService` (service layer), `parseReference` (domain, defined in `domain/transfer-reference.ts`), and the `OrderDocument` type (model).
- **`src/modules/payments/services/index.ts`** — Re-exports `getOrderByReference` as part of the payments service surface.
- **`src/modules/payments/tests/integration/lookup.test.ts`** — Integration tests exercise this function directly.

## Notes

- Card orders (no transfer reference) are **not** reachable through this endpoint by design; admins must find them via normal order search by ID.
- A raw order ID pasted as the "reference" will fail `parseReference` and produce the same 404 — the endpoint deliberately does not distinguish "malformed" from "not found" to avoid leaking which case occurred.
- The function is intentionally thin (parse → query → wrap). If settlement logic is added, it belongs in the offline-payment endpoint, not here.
