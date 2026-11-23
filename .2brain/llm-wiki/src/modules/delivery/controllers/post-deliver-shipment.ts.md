---
source: src/modules/delivery/controllers/post-deliver-shipment.ts
source_sha256: f3198b90814e991e5a97c2b0a79cb2ebd82187dfc4cb5e94a1aaaee0cea58bcb
context_sha256: d20ed8776531d90a15f5260e7dd361e9130b85be2227e7c2a00943e38ea0b723
generated_at: 2026-11-22T04:46:19.683974+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/controllers/post-deliver-shipment.ts

## Purpose
Express controller for `POST /delivery/shipments/:id/deliver`. It lets staff record that a shipment has arrived. Per the module doc, when the delivered shipment is the last one for an order, the order moves from `shipped` to `delivered`. That transition is performed by the service, not by this file.

## Key elements
- `postDeliverShipment(request, response)` is the only export. It is a thin handler that:
  1. Calls `requireId` on the request, with the not-found code `delivery.shipment-not-found`. If no id is returned, it returns `Promise.resolve()`. `requireId` is given `response`, so it presumably sends the error itself.
  2. Calls `deliveryService.deliverShipment(id, request.authContext, callerContextOf(request))`.
  3. If `refused(response, result)` is true, it returns without writing a success response.
  4. Otherwise it sends `successResponse<Shipment>(response, result.data)`.
  5. Any rejection goes to `catchAs(response, 'postDeliverShipment')`.

## Relationships
- `src/infrastructure/http/ids.ts`: `requireId` validates and extracts the `:id` route param.
- `src/infrastructure/http/request.ts`: `callerContextOf` builds the caller context passed to the service.
- `src/infrastructure/http/response.ts`: `successResponse` writes the success payload.
- `src/infrastructure/http/controller.ts`: `refused` handles service results that are refusals, and `catchAs` is the error handler for rejected promises.
- `src/modules/delivery/services/index.ts`: provides `deliveryService`, whose `deliverShipment` holds the business logic.
- `src/types/index.ts`: provides the `Shipment` type used for the response payload.
- `src/modules/delivery/routes.ts`: the neighbor that wires this handler to the route.

## Notes
- The handler uses a promise chain rather than `async/await`. It always returns a Promise, including on the early-exit path.
- It reads `request.authContext` directly. Authentication and authorization must be applied upstream, and this file does not check them.
- The `catchAs` label `'postDeliverShipment'` is the handler's own name.
