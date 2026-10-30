---
source: src/modules/cart/controllers/post-checkout.ts
sha256: 04e6f58aa85a9f277286d9e4250b63953651fe1464452e77b4ed088bdb065554
generated_at: 2026-10-29T03:20:48.120014+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/controllers/post-checkout.ts

## Purpose

Thin HTTP adapter for `POST /cart/checkout`. It validates the request body, delegates to `cartService.orderConfirm`, records the `cart_checkout_total` business metric on every outcome (success, business-level refusal, or thrown error), and returns a `201 Created` with the newly built order in the same wire shape as `POST /orders`.

## Key elements

- **`postCheckout(request, response)`** — sole export; the route handler.
  - Extracts `userId` from `request.authContext!.id`.
  - Validates the body against the `CheckoutBody` zod schema via `parseBody`; a missing/malformed body short-circuits to `422`.
  - Calls `cartService.orderConfirm(userId, callerContextOf(request), body)`.
  - On the resolved result: increments `cart_checkout_total` with `status: 'success' | 'failure'`, then either short-circuits via `refused()` or transforms the `OrderDocument` through `orderService.withActions` before sending `createdResponse<Order>(…, order, \`/orders/${order.id}\`)`.
  - On a thrown error: increments `cart_checkout_total` with `status: 'failure'` and delegates to `catchAs(response, 'postCheckout')`.

## Relationships

- **`src/modules/cart/services/index.ts`** — imports `cartService`; the `orderConfirm` method performs the actual cart-to-order transition and cart clearing.
- **`src/modules/orders/index.ts`** — imports `orderService`; its `withActions` method resolves each line's live `current` values and produces the wire-shape `Order` that the response carries.
- **`src/modules/cart/metrics.ts`** — imports the `cartCheckoutTotal` counter; incremented once per call before any response is written.
- **`src/infrastructure/http/controller.ts`** — imports `parseBody`, `refused`, `catchAs` (shared HTTP validation / error helpers).
- **`src/infrastructure/http/response.ts`** — imports `createdResponse` (201 + `Location` header helper).
- **`src/infrastructure/http/request.ts`** — imports `callerContextOf` (extracts tenant/actor context from the auth token).
- **`src/types/index.ts`** — imports the `Order` type used in the response generic.
- **`src/modules/cart/routes.ts`** — registers `postCheckout` as the handler for `POST /cart/checkout`.

## Notes

- The metric is incremented **before** `refused()` or `catchAs()`, guaranteeing exactly one increment per call regardless of outcome. A failed checkout is intentionally counted as a business result.
- `orderService.withActions` is used specifically because it resolves each order line's live `current` snapshot; a plain `.toJSON()` would omit those fields from the response.
- The `Location` header is set to `/orders/${order.id}`, mirroring the `POST /orders` contract so clients can treat the checkout response as the canonical resource-creation reply.
