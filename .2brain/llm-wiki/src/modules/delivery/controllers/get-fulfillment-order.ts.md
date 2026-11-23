---
source: src/modules/delivery/controllers/get-fulfillment-order.ts
source_sha256: f4682d2b3d4ebd3a607f2d5190b262e262c0c4eddddf2c213e183500707b4e7b
context_sha256: e3b5aee4df95678a1b188e65cab5b1d03dc13ff142e9e0e884f263071f565bce
generated_at: 2026-11-22T04:45:27.851138+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/controllers/get-fulfillment-order.ts

## Purpose
Express controller for `GET /delivery/fulfillment-orders/:id`. It returns a single fulfillment order, for the buyer who owns it and for staff who can see every order. The controller only handles HTTP concerns: ID validation, delegation to the delivery service, and response formatting.

## Key elements
- `getFulfillmentOrder(request, response)`: the exported handler.
  - Validates the `:id` param with `requireId`, using the not-found message key `delivery.fulfillment-order-not-found`. If validation fails it returns `Promise.resolve()` and does nothing more.
  - Calls `deliveryService.getFulfillmentOrder(id, request.authContext)`.
  - If `refused(response, result)` is true, it returns without sending anything further.
  - Otherwise it sends `successResponse<FulfillmentOrder>(response, result.data)`.
  - Rejections are handled by `.catch(catchAs(response, 'getFulfillmentOrder'))`.

## Relationships
- `src/infrastructure/http/ids.ts`: provides `requireId`, which parses and validates the route ID.
- `src/infrastructure/http/response.ts`: provides `successResponse` for the success payload.
- `src/infrastructure/http/controller.ts`: provides `refused`, which handles a service result that was refused, and `catchAs`, which handles errors.
- `src/modules/delivery/services/index.ts`: provides `deliveryService`, which does the lookup and the access decision.
- `src/types/index.ts`: provides the `FulfillmentOrder` type, imported through the `@types` alias.
- `src/modules/delivery/routes.ts`: the route file that wires this handler to the endpoint. It is a neighbor in the dependency graph, but nothing in this file shows how it is wired.

## Notes
- The handler does not check ownership or staff access itself. It passes `request.authContext` to the service, which decides access. A refusal is passed through `refused`.
- Every code path returns a Promise, including the early return on an invalid ID. The handler is not `async`.
