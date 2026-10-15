---
source: src/modules/orders/controllers/create-order.ts
sha256: 5aff64eebf31f27638cf523bd4f094ab5dbf50b4a5218a251f516d8397844566
generated_at: 2026-10-15T10:59:07.995680+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/controllers/create-order.ts

## Purpose

HTTP handler for `POST /orders`. Accepts an explicit `items` payload from the request body and delegates to `orderService.create`, making this the **admin** order-creation path (as opposed to the cart-based checkout flow in `@modules/cart`). It validates the body, calls the service, records a metric, and shapes the success/error response.

## Key elements

- **`createOrder(request, response)`** (exported) — The sole export. Parses the body against `CreateOrderBody` (zod), extracts `userId`, `email`, `items`, then calls `orderService.create` with `callerContextOf(request)`. On success increments `orderCreatedTotal` and delegates to `respondWithOrder` with status **201**. Handles domain-level rejections via `refused` and unexpected errors via `catchAs`.

## Relationships

- **`@infrastructure/http/controller`** — Supplies the shared HTTP helpers `parseBody`, `refused`, and `catchAs` used for validation, domain-rejection short-circuiting, and error serialization.
- **`@infrastructure/http/request`** — Supplies `callerContextOf`, which extracts locale and other caller metadata from the Express request and passes it to the service.
- **`../services`** — Calls `orderService.create(userId, email, items, callerContext)`. The service owns the confirmation-mail side-effect.
- **`./respond`** — Calls `respondWithOrder(response, data, authContext, 'createOrder', 201)` to build the success response.
- **`../metrics`** — Increments the `orderCreatedTotal` counter after a successful, non-refused creation.
- **`../routes`** — Registers `createOrder` as the handler for the `POST /orders` route.
- **`@types`** — Imports `CreateOrderRequest` for the typed `Request` generic.

## Notes

- **Admin vs. checkout:** Items are taken directly from the request body. The cart module has its own creation path; do not conflate the two.
- **Confirmation mail is the service's job.** The controller intentionally does not send mail; the comment in the source ties this to `CallerContext.locale` (the service picks the locale). Adding mail logic here would duplicate responsibility.
- **Metric only on success.** `orderCreatedTotal.inc()` runs *after* the `refused` check, so domain-level rejections (e.g., validation rules inside the service) do not inflate the counter.
- **201, not 200.** The handler returns a `201 Created` status, consistent with resource-creation semantics.
