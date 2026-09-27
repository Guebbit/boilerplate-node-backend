---
source: src/modules/cart/controllers/post-checkout.ts
sha256: a577ba04800a71ffe186c79d8312e3d7a9fd4b76d271e21bb7de1d085be3c316
generated_at: 2026-09-27T14:43:58.524253+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/controllers/post-checkout.ts

## Purpose

HTTP adapter for `POST /cart/checkout`. It validates the request body, delegates to `cartService.orderConfirm` to convert the cart into an order, records the `cart_checkout_total` metric on every outcome (success, business-rejection, or thrown error), and shapes the success response via `orderService.withActions`.

## Key elements

- **`postCheckout`** (exported) — The sole export. Reads `request.authContext!.id`, parses the body against the `CheckoutBody` Zod schema, then chains:
  1. `cartService.orderConfirm(userId, callerContext, addressId, paymentMethod, notes)`
  2. On resolution: increments `cartCheckoutTotal`, returns early via `refused()` if the result is a business rejection; otherwise calls `orderService.withActions` to produce the wire-shaped `CheckoutResponse` and sends a **201** via `successResponse`.
  3. On rejection (`.catch`): increments `cartCheckoutTotal` with `status: 'failure'`, then delegates to `catchAs(response, 'postCheckout')`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — provides `parseBody`, `refused`, and `catchAs` (body validation, rejection short-circuit, error serialization).
- **`src/infrastructure/http/request.ts`** — provides `callerContextOf` to extract the authenticated caller context for the service call.
- **`src/infrastructure/http/response.ts`** — provides `successResponse` to send the 201 payload.
- **`src/infrastructure/i18n/index.ts` / `context.ts`** — provides the `t()` translation function for the success message (`orders.creation-success`).
- **`src/modules/cart/services/index.ts`** — source of `cartService.orderConfirm`, the actual cart→order business logic.
- **`src/modules/cart/metrics.ts`** — source of the `cartCheckoutTotal` Prometheus counter.
- **`src/modules/orders/index.ts` / `services/index.ts`** — source of `orderService.withActions`, which resolves the `OrderDocument` into its API wire shape.
- **`src/types/index.ts`** — source of the `CheckoutResponse` type used in the success payload.
- **`src/modules/cart/routes.ts`** — registers this handler on the `POST /cart/checkout` route.

## Notes

- **Body fallback:** `request.body ?? {}` is required because Express 5 leaves `body` as `undefined` when the client sends no body; a checkout with an empty body is legal.
- **Metric timing:** `cartCheckoutTotal.inc` fires *before* `refused()` on the business-rejection path and *before* `catchAs` on the error path, guaranteeing exactly one increment per call regardless of outcome.
- **`withActions` vs `.toJSON()`:** The comment notes that `withActions` is the single point where an `OrderDocument` becomes the wire shape and resolves each line's live `current` picture; calling `.toJSON()` directly would omit that data from the response.
- **Non-null assertion:** `request.authContext!` assumes the auth middleware has already populated the context; no guard exists in this file.
