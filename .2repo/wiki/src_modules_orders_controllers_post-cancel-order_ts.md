# src/modules/orders/controllers/post-cancel-order.ts

## Purpose

Single-route controller for `POST /orders/:id/cancel` — the only order-write action a customer can perform. It delegates to `orderService.cancelById`, passing the caller's auth context and scope so the service's conditional write enforces who may cancel (customer: own, non-soft-deleted, allowed statuses; admin: any) and whether a refund applies.

## Key elements

- **`postCancelOrder`** (exported) – Express handler. Reads `request.params.id`, `request.authContext`, and the optional `request.body?.refund`, calls `orderService.cancelById`, then either short-circuits via `refused` (403/409 etc.) or sends `successResponse` with `orderService.withActions(...)` attached to the payload (status 200). Errors are funneled through `catchAs`.

## Relationships

- **`src/modules/orders/service.ts`** – Calls `orderService.cancelById` for the business logic and `orderService.withActions` to decorate the response payload with permitted next actions.
- **`src/infrastructure/http/controller.ts`** – Imports `catchAs` (uniform error response) and `refused` (early-exit for denied/failed results).
- **`src/infrastructure/http/request.ts`** – Imports `callerContextOf` to derive the request-scoped context passed into the service call.
- **`src/infrastructure/http/response.ts`** – Imports `successResponse` to emit the 200 JSON envelope.
- **`src/modules/orders/routes.ts`** – Registers this handler on the `POST /orders/:id/cancel` path.
- **`src/types/index.ts`** – Provides the `CancelOrderRequest` type used for the (optional) body shape.

## Notes

- The body is **optional**. Customers send no body at all; Express leaves `request.body` as `undefined` (not `{}`), so the handler guards with `request.body?.refund`.
- `refund` is an **operator-level** flag. The service silently ignores it for a customer caller (customers are always refunded); it is meaningful only when an admin triggers the same endpoint.
- The function signature types `request.params.id` as `string | undefined` (route param may be absent on malformed requests) and coerces with `String(request.params.id)` before passing to the service.
- There is no `@HttpCode`-style decorator; status 200 is passed explicitly to `successResponse`, and non-2xx outcomes are handled entirely by `refused`/`catchAs`.
