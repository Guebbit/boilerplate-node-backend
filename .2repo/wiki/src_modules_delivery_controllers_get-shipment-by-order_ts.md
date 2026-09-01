# src/modules/delivery/controllers/get-shipment-by-order.ts

## Purpose
Express route handler for `GET /delivery/order/:orderId`. Resolves the shipment (tracking code, arrival status) tied to a given order ID, intended for the order page's shipping panel once the order status is `shipped`.

## Key elements
- **`getShipmentByOrder`** (exported) – The sole handler. Calls `deliveryService.getForOrder(orderId, authContext)`, then either short-circuits with `refused` (e.g. not-found / not-authorized) or sends `successResponse(result.data)`. Errors are funneled to `catchAs(response, 'getShipmentByOrder')`.

## Relationships
- **`src/infrastructure/http/controller.ts`** – Provides the `catchAs` (error → standard error response) and `refused` (domain refusal → appropriate HTTP status) helpers used here.
- **`src/infrastructure/http/response.ts`** – Provides `successResponse` for the 200 path.
- **`src/modules/delivery/service.ts`** – Source of `deliveryService.getForOrder`; the single business-logic call this controller makes.
- **`src/modules/delivery/routes.ts`** – Registers `getShipmentByOrder` as the handler for the `GET /delivery/order/:orderId` route.

## Notes
- `request.params.orderId` is typed `string | undefined` in the generic, but the handler coerces it with `String(...)`. If the param is genuinely missing, the service receives the literal string `"undefined"` rather than a validation error—route matching is expected to guarantee presence.
- Authentication is delegated to an upstream middleware that attaches `request.authContext`; this handler does not check auth itself.
