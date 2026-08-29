# src/modules/payments/controllers/get-payment-by-order.ts

## Purpose
Controller handler for `GET /payments/order/:orderId`. It retrieves the payment intent (and its current status) associated with a given order so that the order page's payment panel can restore in-flight state on reload instead of forcing the user to start over.

## Key elements
- **`getPaymentByOrder`** (exported function) — Accepts an Express `Request<{ orderId?: string }>` and `Response`. Calls `paymentService.getForOrder(orderId, authContext)`, then either short-circuits via `refused` or resolves with `successResponse`. All unhandled rejections are funnelled into `catchAs`.

## Relationships
- **`src/modules/payments/routes.ts`** — Registers this handler on the `/payments/order/:orderId` route.
- **`src/modules/payments/service.ts`** — Provides `paymentService.getForOrder()`, the actual data-fetching + authorization logic this controller delegates to.
- **`src/infrastructure/http/response.ts`** — Supplies `successResponse` for the 200 path.
- **`src/infrastructure/http/controller.ts`** — Supplies `refused` (401/403 short-circuit) and `catchAs` (structured error → response).

## Notes
- The `orderId` param is coerced with `String(...)` before being passed to the service; the type is `orderId?: string` on the Request generic, so the cast guards against `undefined` at runtime.
- Authorization context is read from `request.authContext` (set by upstream middleware, not this file) and forwarded to the service.
- The handler is a plain function using promise `.then/.catch` rather than `async/await`, consistent with the surrounding controller style.
