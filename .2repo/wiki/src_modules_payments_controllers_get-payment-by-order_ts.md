# src/modules/payments/controllers/get-payment-by-order.ts

## Purpose

Thin Express controller for `GET /payments/order/:orderId`. It delegates to `paymentService.getForOrder` and returns the payment (intent, status, etc.) so the order page's payment panel can recover its state on a mid-flow reload rather than restarting.

## Key elements

- **`getPaymentByOrder(request, response)`** (exported) — Resolves the `orderId` route param, calls `paymentService.getForOrder` with the caller's `authContext`, then either short-circuits via `refused` (rejected result) or sends the payload via `successResponse`. Errors are funneled to `catchAs(response, 'getPaymentByOrder')`.

## Relationships

- **`src/modules/payments/service.ts`** — Calls `paymentService.getForOrder(orderId, authContext)`; this is the sole business-logic dependency.
- **`src/infrastructure/http/controller.ts`** — Provides the `catchAs` (error → HTTP) and `refused` (rejected-result → HTTP) helpers.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse` for the happy-path JSON envelope.
- **`src/modules/payments/routes.ts`** — Registers `getPaymentByOrder` as the handler for the `GET /payments/order/:orderId` route.

## Notes

- The route param is typed `orderId?: string` but immediately wrapped in `String(...)` before being passed to the service — harmless but suggests the param could theoretically arrive as a non-string in some middleware configurations.
- `request.authContext` is expected to be populated by upstream auth middleware; the controller does not validate its presence.
- The `refused` / `successResponse` split means the service can return a structured "rejected" result (e.g. not-found, not-authorized) that maps to a non-2xx without throwing.
