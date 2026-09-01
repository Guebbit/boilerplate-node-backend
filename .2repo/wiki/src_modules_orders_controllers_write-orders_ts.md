# src/modules/orders/controllers/write-orders.ts

## Purpose

Admin controller that handles order creation (POST) and update (PUT) in a single exported handler. It exists to give administrators a direct way to create or modify orders by supplying the full item list in the request body, bypassing the cart/checkout flow used by end users.

## Key elements

- **`writeOrders`** (exported controller function) — Branches on the presence of an `id`:
  - *No id (POST):* validates body with `CreateOrderBody`, calls `orderService.create`, increments `orderCreatedTotal`, responds 201 with action-enriched data.
  - *No id (PUT):* immediately rejects with 422 + i18n message.
  - *With id (PUT):* picks `UpdateOrderByIdBody` (id from path) or `UpdateOrderBody` (id in body), calls `orderService.updateById`, responds 200.
- **`readInput(request, …)`** — single-point extraction of the `id` param (no separate `request.params` access).
- **`callerContextOf(request)`** — passes caller/locale context into the service for i18n-aware side-effects (e.g. confirmation e-mail).
- **`refused(response, result)`** — guard that short-circuits the success path when the service signals a refusal.
- **`catchAs(response, …)`** — wraps the `.catch` to map thrown errors to a consistent HTTP error response.

## Relationships

- **`@infrastructure/http/controller`** — supplies `catchAs`, `refused`, `rejectValidation` used for uniform error/refusal handling.
- **`@infrastructure/http/request`** — supplies `readInput` (param extraction) and `callerContextOf` (locale/auth context forwarding).
- **`@infrastructure/http/response`** — supplies `successResponse` and `rejectResponse` for building HTTP replies.
- **`@infrastructure/i18n`** — supplies the `t()` translator used in the 422 message.
- **`@modules/orders/service`** — the `orderService` instance whose `create`, `updateById`, and `withActions` methods perform the actual business logic.
- **`@modules/orders/metrics`** — provides the `orderCreatedTotal` Prometheus counter incremented on successful creation.
- **`@modules/orders/routes`** — registers `writeOrders` as the POST/PUT handler for `/orders(/:id)`.
- **`@types`** — provides the request-tuple types (`CreateOrderRequest`, `UpdateOrderRequest`, `UpdateOrderByIdRequest`) used in the Express `Request` generic.

## Notes

- This is explicitly the **admin** path. Items are taken from the body, not from a cart; it does not touch `@modules/cart` at all.
- Two distinct Zod schemas guard the update branch: `UpdateOrderByIdBody` when the id is a path param, `UpdateOrderBody` when it is in the body. The switch is driven by `request.params.id` truthiness.
- The confirmation e-mail is emitted inside `orderService.create`, not here. The controller only forwards `callerContextOf` so the service can pick the right locale.
- Orders carry no multipart fields, so `readInput` is called without a decode step.
- `orderCreatedTotal.inc()` is called *after* the `refused` check, so refused creations do not increment the counter.
