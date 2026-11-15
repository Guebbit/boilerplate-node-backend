---
source: src/modules/cart/controllers/post-checkout.ts
sha256: 094be7aa3c3bce355ab80653b659837ca51bf84e7a93a8c5077db2f2ffb8af7f
generated_at: 2026-11-14T19:28:06.790173+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/controllers/post-checkout.ts

## Purpose

Thin HTTP adapter for `POST /cart/checkout`. It validates the request body, delegates to `cartService` to convert the cart into an order, records the `cart_checkout_total` metric on every outcome, and shapes the created order into a `201 Created` response.

## Key elements

- **`postCheckout(request, response)`** — sole export; the route handler for checkout.
  - Validates the body with `parseBody(CheckoutBody, …)`; a missing/malformed body short-circuits to `422`.
  - Calls `cartService.orderConfirm(userId, callerContextOf(request), body)`.
  - Increments `cartCheckoutTotal` (`status: 'success' | 'failure'`) **before** the `refused()` check, so both outcomes are recorded.
  - On success, pipes the `OrderDocument` through `orderService.withActions(…)` to obtain the wire-shape `Order` (resolves each line's live `current` picture).
  - Responds with `answerAsResource` (ETag) + `createdResponse<Order>` (201, `Location: /orders/:id`).
  - In `.catch`, increments the metric with `status: 'failure'` and delegates to `catchAs(response, 'postCheckout')`.

## Relationships

- **`src/modules/cart/services/index.ts`** — this file imports `cartService` from it; the controller delegates the core checkout operation to that service.
- **`src/modules/orders/index.ts`** — this file imports `orderService` from it; used to project the `OrderDocument` into its wire-shape `Order` before responding.
- **`src/modules/orders/services/index.ts`** — underlying orders service module related to the `orderService` import path.
- **`src/modules/cart/metrics.ts`** — source of the `cartCheckoutTotal` counter incremented on every checkout attempt.
- **`src/infrastructure/http/controller.ts`** — supplies `parseBody`, `refused`, and `catchAs` for body validation, rejection envelopes, and error serialization.
- **`src/infrastructure/http/response.ts`** — supplies `createdResponse` for the 201 + `Location` header.
- **`src/infrastructure/http/preconditions.ts`** — supplies `answerAsResource` to set the `ETag` from the order document.
- **`src/infrastructure/http/request.ts`** — supplies `callerContextOf` to extract the caller's context from the Express request.
- **`src/types/index.ts`** — provides the `Order` type used as the generic parameter of `createdResponse`.
- **`src/modules/cart/routes.ts`** — consumer; registers `postCheckout` on the `POST /cart/checkout` path.

## Notes

- The metric increments **three** times in the source (success path, `refused` path, catch path) but semantically once per request: the success and refused branches are mutually exclusive, and the catch branch handles thrown errors. A failed checkout is intentionally still counted.
- Do **not** replace the `orderService.withActions` call with a bare `result.data.toJSON()` — the comment in-file warns that `.toJSON()` would omit each line's `current` picture from the response.
- The response carries **both** an `ETag` (from `answerAsResource`) and a `Location` header (from `createdResponse`); the `message` field in the envelope doubles as the confirmation copy.
