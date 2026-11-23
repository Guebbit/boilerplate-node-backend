---
source: src/modules/delivery/controllers/post-fulfill-fulfillment-order.ts
source_sha256: 55cba83dc44b644625d68e930a3c1b58e67444e50aa0852fe5dbbc049c3cd37f
context_sha256: d20ed8776531d90a15f5260e7dd361e9130b85be2227e7c2a00943e38ea0b723
generated_at: 2026-11-22T04:46:25.929761+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/controllers/post-fulfill-fulfillment-order.ts

## Purpose
Express controller for `POST /delivery/fulfillment-orders/:id/fulfill`. It lets staff fulfill a digital fulfillment order, producing a shipment with no parcel that is born delivered. The controller validates the route id, delegates to the delivery service, and returns a `201 Created` response for the new shipment.

## Key elements
- `postFulfillFulfillmentOrder(request, response)`: the exported handler.
  - Reads the `:id` param with `requireId`, using the not-found key `delivery.fulfillment-order-not-found`. If no id is returned, it resolves immediately and does nothing further, so `requireId` is expected to have already sent the error response.
  - Calls `deliveryService.fulfillFulfillmentOrder(id, request.authContext, callerContextOf(request))`.
  - If `refused(response, result)` is true, it returns without further action.
  - Otherwise it calls `createdResponse<Shipment>` with `result.data` and the location `/delivery/shipments/{result.data.id}`.
  - Any rejection is handled by `catchAs(response, 'postFulfillFulfillmentOrder')`.

## Relationships
- `src/infrastructure/http/controller.ts`: supplies `refused`, which checks the service result and responds if it was refused, and `catchAs`, the error handler.
- `src/infrastructure/http/ids.ts`: supplies `requireId`, which validates the path id.
- `src/infrastructure/http/request.ts`: supplies `callerContextOf`, which builds the caller context passed to the service.
- `src/infrastructure/http/response.ts`: supplies `createdResponse`, which sends the 201 with the location.
- `src/modules/delivery/services/index.ts`: supplies `deliveryService`, whose `fulfillFulfillmentOrder` does the business logic.
- `src/types/index.ts`: supplies the `Shipment` type, imported via the `@types` alias.
- `src/modules/delivery/routes.ts`: the routing layer that this handler is registered through. The handler's doc comment gives the route path.

## Notes
- The handler returns a Promise on every path (`Promise.resolve()` on early exit), so callers can await it uniformly.
- The controller contains no business logic. It only handles HTTP concerns and relies on `authContext` being attached to the request upstream.
