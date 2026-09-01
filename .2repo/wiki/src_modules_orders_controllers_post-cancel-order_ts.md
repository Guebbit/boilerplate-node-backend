# src/modules/orders/controllers/post-cancel-order.ts

## Purpose

HTTP handler for `POST /orders/:id/cancel`. Thin wiring that forwards the request to `orderService.cancelById`, passing the caller's auth scope and an optional `refund` flag, then shapes the result into a standard success or refusal response.

## Key elements

- **`postCancelOrder`** *(exported)* — The sole route handler. Accepts an Express `Request` (with an optional `CancelOrderRequest` body) and `Response`. Calls `orderService.cancelById` with the order ID, `request.authContext`, `{ refund: request.body?.refund }`, and `callerContextOf(request)`. On success, responds 200 with `orderService.withActions(result.data, request.authContext)` to include allowed follow-up actions. On denial, `refused` short-circuits; on error, `catchAs` handles it.

## Relationships

- **`src/modules/orders/service.ts`** — Delegates all domain logic to `orderService.cancelById` and `orderService.withActions`.
- **`src/modules/orders/routes.ts`** — Registers `postCancelOrder` on the `POST /orders/:id/cancel` path.
- **`src/infrastructure/http/controller.ts`** — Supplies the `catchAs` and `refused` helpers used for error handling and denial short-circuit.
- **`src/infrastructure/http/request.ts`** — Supplies `callerContextOf` to extract the authenticated caller's context from the Express request.
- **`src/infrastructure/http/response.ts`** — Supplies `successResponse` for the standard success envelope.
- **`src/types/index.ts`** — Provides the `CancelOrderRequest` type (currently only `{ refund?: boolean }` based on usage).

## Notes

- **Body is truly optional, not merely empty.** Customers cancel with no body; Express leaves `request.body` as `undefined` (not `{}`). The handler guards with `request.body?.refund`.
- **`refund` is admin-only in effect.** The flag is always forwarded to the service, but the service (not this controller) decides whether to honor it — a customer's cancel is always refunded.
- **Scope enforcement lives in the service.** This controller does not check ownership or status; it passes `request.authContext` and lets `cancelById` enforce that non-admins can only cancel their own order from customer-permitted statuses.
