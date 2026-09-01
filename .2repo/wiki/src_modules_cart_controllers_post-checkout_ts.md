# src/modules/cart/controllers/post-checkout.ts

## Purpose

Thin HTTP adapter for `POST /cart/checkout`. Extracts the authenticated user and optional body fields, delegates to `cartService.orderConfirm`, maps the result to a 201 or a refused response, and records the `cart_checkout_total` metric on every code path (success, business-refusal, and thrown error).

## Key elements

- **`postCheckout(request, response)`** (exported) — The sole handler. Reads `userId` from `authContextOf(request)`, destructures optional `addressId` / `shippingMethodId` from `request.body`, calls `cartService.orderConfirm`, then either increments the metric + sends a `201` with `{ order, message: t('orders.creation-success') }`, or increments the metric + calls `refused()` / `catchAs()`.

## Relationships

- **`src/modules/cart/services/index.ts`** — calls `cartService.orderConfirm(userId, callerContextOf, addressId, shippingMethodId)`; this file is the sole HTTP entry point into that service for checkout.
- **`src/modules/cart/metrics.ts`** — increments `cartCheckoutTotal` with `{ status: 'success' | 'failure' }` on every path before delegating the response.
- **`src/infrastructure/http/request.ts`** — uses `authContextOf` (user id) and `callerContextOf` (opaque caller metadata passed to the service).
- **`src/infrastructure/http/response.ts`** — uses `successResponse` to emit the 201 JSON body.
- **`src/infrastructure/http/controller.ts`** — uses `refused(response, result)` to short-circuit business-level failures and `catchAs(response, 'postCheckout')` to format thrown errors into an HTTP response.
- **`src/infrastructure/i18n/index.ts`** — calls `t('orders.creation-success')` for the localized success message.
- **`src/modules/cart/routes.ts`** — registers `postCheckout` as the handler for the `POST /cart/checkout` route (the consumer of this export).

## Notes

- **Metric-before-refusal contract:** `cartCheckoutTotal.inc()` fires *before* `refused()` in the success path and *before* `catchAs()` in the error path. A failed checkout still counts as a recorded checkout attempt; do not move the increment after the refusal check.
- **Express 5 body quirk:** `request.body` is `undefined` (not `{}`) when the client sends no body. The `?? {}` guard is load-bearing — removing it causes a `TypeError` on `destructuring undefined`.
- **`refused()` is a fire-and-forget guard:** if it returns early (meaning the result was a business refusal), the 201 branch is skipped. The handler does not `return` a value in either branch; it mutates `response` via the infrastructure helpers.
- **`callerContextOf` is passed opaquely** to `orderConfirm`; the controller does not inspect or transform it.
