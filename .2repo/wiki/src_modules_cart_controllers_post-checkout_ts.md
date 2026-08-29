# src/modules/cart/controllers/post-checkout.ts

## Purpose

Controller for `POST /cart/checkout`. Converts the caller's cart into an order and clears the cart. It exists as a thin orchestrator: extract identity and body params, delegate to `cartService.orderConfirm`, then translate the result into an HTTP response — while guaranteeing the `cartCheckoutTotal` business metric fires on every outcome (success, business refusal, and thrown error).

## Key elements

- **`postCheckout(request, response)`** — exported handler. Reads `userId` from the auth context and `addressId` / `shippingMethodId` from the (optionally absent) request body, calls `cartService.orderConfirm`, then branches:
  - success → `successResponse(…, 201)` with an i18n message
  - business refusal → `refused()` (shared 409 helper)
  - thrown error → `catchAs(response, 'postCheckout')(error)` (shared 500 helper)
  - each branch increments `cartCheckoutTotal.inc({ status })` before responding.

## Relationships

- **`src/modules/cart/services/index.ts`** — calls `cartService.orderConfirm(userId, callerContext, addressId, shippingMethodId)`; the entire business logic lives there.
- **`src/modules/cart/metrics.ts`** — increments `cartCheckoutTotal` on every code path before the response is sent.
- **`src/infrastructure/http/controller.ts`** — provides `refused()` (business-rejection response) and `catchAs()` (unified error response).
- **`src/infrastructure/http/request.ts`** — provides `authContextOf()` and `callerContextOf()` for extracting identity and propagation context.
- **`src/infrastructure/http/response.ts`** — provides `successResponse()` for the 201 reply.
- **`src/infrastructure/i18n/index.ts`** — provides `t()` for the localized success message.
- **`src/modules/cart/routes.ts`** — registers this handler on the `POST /cart/checkout` route.

## Notes

- `request.body` is guarded with `?? {}` because Express 5 leaves `body` as `undefined` when no body is sent, and a bodyless checkout is a valid request.
- The metric increment is deliberately duplicated across the `.then` and `.catch` arms rather than delegated to `catchAs`. This ensures no code path can return a response without first recording the outcome — the shared helpers have no knowledge of this metric.
- The handler returns the promise chain (does not `await`); `routes.ts` / Express handles the eventual `response` write.
