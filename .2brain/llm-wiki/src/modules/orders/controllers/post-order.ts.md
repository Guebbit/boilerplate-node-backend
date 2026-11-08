---
source: src/modules/orders/controllers/post-order.ts
sha256: 5aff64eebf31f27638cf523bd4f094ab5dbf50b4a5218a251f516d8397844566
generated_at: 2026-11-08T06:47:19.109351+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/controllers/post-order.ts

## Purpose

Handler for `POST /orders` — the admin path that creates an order directly from an explicit payload in the request body, bypassing the cart. It validates the body, delegates to `orderService.create`, records a metric, and returns a `201` with the created order.

## Key elements

- **`createOrder(request, response)`** — The sole export. Parses and validates the body against the `CreateOrderBody` Zod schema, destructures `{ userId, email, items }`, calls `orderService.create(userId, email, items, callerContextOf(request))`, then either refuses the response (service-level rejection), increments `orderCreatedTotal` and sends `201` via `respondWithOrder`, or funnels errors through `catchAs`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Source of `parseBody`, `refused`, and `catchAs` (shared validation/rejection/error helpers).
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf`, which extracts locale/auth context from the request and passes it to the service layer.
- **`src/modules/orders/services/index.ts`** — Provides `orderService`; the actual order-creation logic (and confirmation email) lives there.
- **`src/modules/orders/metrics.ts`** — Exports the `orderCreatedTotal` Prometheus counter incremented on success.
- **`src/modules/orders/controllers/respond.ts`** — Provides `respondWithOrder`, the shared serialization + status-writing helper for order payloads.
- **`src/modules/orders/routes.ts`** — Registers `createOrder` on the `POST /orders` route.
- **`src/types/index.ts`** — Supplies the `CreateOrderRequest` type used in the Express generics.

## Notes

- The confirmation email is the responsibility of `orderService.create`, **not** this controller. The code comment flags this explicitly: it is a fact about the order, not about the request. Don't add mail logic here.
- `callerContextOf(request)` carries locale and other per-request context into the service — it is the bridge between HTTP concerns and domain concerns.
- The success status is hard-coded to `201` in the `respondWithOrder` call; there is no 200 path for this endpoint.
- The early-return after a failed `parseBody` resolves the promise with `undefined` rather than throwing — the response has already been written by `parseBody`.
