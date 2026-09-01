# src/modules/payments/controllers/post-payment-refund.ts

## Purpose

HTTP handler for `POST /payments/order/:orderId/refund`. It performs a standalone monetary refund on an order **without altering the order's status**. It exists as a separate endpoint so an admin/operator can refund or cancel independently; "cancel and refund" is simply the client calling this endpoint plus the order-cancel endpoint.

## Key elements

- **`postPaymentRefund`** (exported) — Express route handler. Reads `orderId` from `request.params`, calls `paymentService.refundByOrder(orderId, authContext, callerContext)`, then either short-circuits via `refused()` (rejected result) or sends a 200 via `successResponse()`. Errors are funneled through `catchAs(response, 'postPaymentRefund')`.

## Relationships

- **`src/modules/payments/service.ts`** — Imports `paymentService`; delegates all business logic to its `refundByOrder` method.
- **`src/modules/payments/routes.ts`** — Wires `postPaymentRefund` to the `POST /payments/order/:orderId/refund` route (admin-only guard applied there).
- **`src/infrastructure/http/controller.ts`** — Supplies `catchAs` (unified error formatting) and `refused` (detects a rejected result and sends the appropriate 4xx).
- **`src/infrastructure/http/request.ts`** — Supplies `callerContextOf` to extract caller metadata passed into the service call.
- **`src/infrastructure/http/response.ts`** — Supplies `successResponse` to shape the 200 reply body.

## Notes

- **No status change by design.** The doc block and code make clear this endpoint does not mutate order status. If you need "cancel and refund," issue both this and the cancel endpoint separately.
- **Admin-only enforcement lives in the route**, not in this handler. The handler itself performs no authorization check.
- `orderId` is typed as `orderId?: string` on the param generic and then coerced with `String()` before the service call—treat it as always present at runtime (the route path requires it).
