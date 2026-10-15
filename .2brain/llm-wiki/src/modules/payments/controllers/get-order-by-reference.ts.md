---
source: src/modules/payments/controllers/get-order-by-reference.ts
sha256: 78796b3a7805e5cc161ab56efe652193f55d8181111eed38052475ac962b14ef
generated_at: 2026-10-15T11:23:04.501856+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/controllers/get-order-by-reference.ts

## Purpose

Handles the `GET /payments/order-by-reference` endpoint. An admin pastes a reference code (RF code) read from a bank's website and receives the order that code corresponds to. This is the lookup step that precedes `POST /payments/order/:orderId/offline` — the doc comment treats it as carrying the same authority as actually recording the payment.

## Key elements

- **`getOrderByReference(request, response)`** (exported) — The sole controller. Validates the `ref` query parameter via `GetOrderByReferenceQueryParams`, calls `paymentService.getOrderByReference`, then enriches the resulting order with `orderService.withActions(order, request.authContext)` before responding with a `successResponse<Order>`.
- **`refused` / `parseBody` / `catchAs`** — Standard HTTP plumbing imported from the shared controller helpers. `parseBody` enforces the zod schema (missing or oversized `ref` → 422); `refused` short-circuits on a rejected result; `catchAs` maps unhandled errors to a 500 with a service tag.

## Relationships

- **`@infrastructure/http/controller`** — Provides `parseBody`, `refused`, and `catchAs` for validation, rejection, and error mapping.
- **`@infrastructure/http/response`** — Provides `successResponse` for the 200 JSON envelope.
- **`@modules/orders` (index)** — Exposes `orderService`, used here solely for the `withActions` enrichment step.
- **`@modules/payments/services` (index)** — Exposes `paymentService`, which owns the `getOrderByReference` domain query (the mod-97 lookup).
- **`@modules/payments/routes.ts`** — Wires this handler onto the `GET /payments/order-by-reference` path.
- **`@types` (index)** — Supplies the `Order` type used in the response generic.

## Notes

- The zod schema on `ref` exists specifically so a bad/missing value yields **422** at the controller layer rather than falling through to the mod-97 check and surfacing as a generic **404**.
- `withActions` is not just decoration: it resolves the order lines' `current` images and computes the caller's permitted next actions (e.g. `refund`, `cancel`), which is the primary reason an admin hits this endpoint.
- The handler is a plain function (not a class method), consistent with the other controllers in this module.
