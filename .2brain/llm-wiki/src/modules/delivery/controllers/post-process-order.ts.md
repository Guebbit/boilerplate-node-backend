---
source: src/modules/delivery/controllers/post-process-order.ts
source_sha256: 40f00ae6e5622cb415acd17872891ec44d6a93e699542c30bfa10487f9ba2693
context_sha256: 538a019af3d8642ae57dac67b15e209e2d53570832e44ffcbbc3225946ce19c6
generated_at: 2026-11-22T04:47:02.097260+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/controllers/post-process-order.ts

## Purpose
Express controller for `POST /orders/:id/process`. It lets staff report that fulfillment has started on a paid order, and it is the only entry point that moves an order from `paid` to `processing`. This happens before any parcel exists to record.

## Key elements
- `postProcessOrder(request, response)`: the exported handler. It does the following:
  - Validates the `:id` param with `requireId`, using the not-found key `delivery.order-not-found`. If there is no valid id, it returns without further work.
  - Calls `deliveryService.processOrder(orderId, request.authContext, callerContextOf(request))`.
  - If `refused(response, result)` reports a refusal, it stops and sends nothing more.
  - Otherwise it calls `answerAsResource` with the order data and the path `/orders/<id>`, then sends `successResponse<Order>` with the order.
  - Any rejection is handled by `catchAs(response, 'postProcessOrder')`.

## Relationships
- `src/infrastructure/http/ids.ts` (`requireId`): parses and validates the route id, and responds with not-found when it is missing or invalid.
- `src/infrastructure/http/request.ts` (`callerContextOf`): builds the caller context passed to the service.
- `src/infrastructure/http/response.ts` (`successResponse`): sends the success payload.
- `src/infrastructure/http/preconditions.ts` (`answerAsResource`): attaches the order's real tag and resource location to the response.
- `src/infrastructure/http/controller.ts` (`catchAs`, `refused`): shared error handling and detection of refused service results.
- `src/modules/delivery/services/index.ts` (`deliveryService`): `processOrder` performs the actual state transition.
- `src/types/index.ts` (`Order`): the response data type.
- `src/modules/delivery/order-routes.ts`: the file's position in the graph suggests the route is registered there. The registration is not visible in this file.

## Notes
- The handler returns a Promise in every path. When the id is invalid it returns `Promise.resolve()` after `requireId` has already responded.
- Errors from the service are handled in two ways. Refusals come back as results and are handled by `refused`. Thrown or rejected errors go to `catchAs`.
