---
source: src/modules/cart/controllers/post-checkout.ts
sha256: 074dd0c5e7859467d236e0a070599c283269a14ba73f7a9b5da42d57e6db201c
generated_at: 2026-09-23T18:29:40.194490+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/controllers/post-checkout.ts

## Purpose

Thin HTTP adapter for `POST /cart/checkout`. It validates the request body, delegates to `cartService.orderConfirm`, records the `cart_checkout_total` metric on every outcome, and on success transforms the resulting order document into its wire shape before sending a `201` response.

## Key elements

- **`postCheckout(request, response)`** — The sole export. Orchestrates the full checkout flow:
    1. Extracts `userId` from `request.authContext`.
    2. Parses the body with the `CheckoutBody` Zod schema (`request.body ?? {}` guards against Express 5 leaving `body` undefined).
    3. Calls `cartService.orderConfirm(userId, callerContext, addressId, shippingMethodId, paymentMethod, notes)`.
    4. On success: increments `cart_checkout_total{status="success"}`, calls `orderService.withActions` to produce the wire-shaped order, and sends `201` with the i18n message `orders.creation-success`.
    5. On failure or thrown error: increments `cart_checkout_total{status="failure"}`, then delegates to `refused()` or `catchAs()` respectively.

## Relationships

- **`src/modules/cart/services/index.ts`** — Calls `cartService.orderConfirm`, the core business logic for converting a cart to an order.
- **`src/modules/orders/index.ts` / `src/modules/orders/services/index.ts`** — Calls `orderService.withActions` to transform the `OrderDocument` into the response wire shape (resolves each line's live `current` picture).
- **`src/modules/cart/metrics.ts`** — Imports and increments `cartCheckoutTotal`.
- **`src/infrastructure/http/controller.ts`** — Uses `parseBody`, `refused`, and `catchAs` for request validation and error short-circuiting.
- **`src/infrastructure/http/response.ts`** — Uses `successResponse` for the `201` reply.
- **`src/infrastructure/http/request.ts`** — Uses `callerContextOf` to extract caller metadata for the service call.
- **`src/infrastructure/i18n/index.ts`** — Uses `t('orders.creation-success')` for the localized success message.
- **`src/modules/cart/routes.ts`** — Presumably registers this handler on the `POST /cart/checkout` route.
- **`src/types/index.ts`** — Imports `CheckoutResponse` as the typed response envelope.

## Notes

- **Metric-before-refusal:** `cartCheckoutTotal.inc()` fires _before_ `refused()` is called. A refused checkout still counts as a business-level result; skipping it would undercount.
- **`?? {}` body guard:** Express 5 can leave `request.body` as `undefined` when no body is sent. The `?? {}` is intentional, not defensive over-coding.
- **`withActions` vs `.toJSON()`:** The response requires `orderService.withActions` (not a plain serialization) because it resolves each line-item's live `current` picture. A bare `.toJSON()` would omit those fields entirely.
- **Single metric increment per call:** The `.then` and `.catch` branches are mutually exclusive, so the metric increments exactly once per request.
