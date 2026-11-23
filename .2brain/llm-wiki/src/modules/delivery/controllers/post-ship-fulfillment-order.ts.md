---
source: src/modules/delivery/controllers/post-ship-fulfillment-order.ts
source_sha256: 993a05cbd42fae3df04e61042dbaccb2206b9a49fdc2b0201abee539d7385a53
context_sha256: d20ed8776531d90a15f5260e7dd361e9130b85be2227e7c2a00943e38ea0b723
generated_at: 2026-11-22T04:47:15.356092+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/controllers/post-ship-fulfillment-order.ts

## Purpose
Express controller for `POST /delivery/fulfillment-orders/:id/shipments`. It lets staff cut a shipment from a fulfillment order, covering some or all of what remains of it. It validates the input, delegates to the delivery service, and returns a 201 response pointing at the new shipment.

## Key elements
- `postShipFulfillmentOrder(request, response)`: the only export. It runs these steps:
  1. Extracts the `:id` path param with `requireId`. A missing or invalid id uses the not-found key `delivery.fulfillment-order-not-found`.
  2. Validates `request.body ?? {}` against the `ShipFulfillmentOrderBody` zod schema via `parseBody`.
  3. Calls `deliveryService.shipFulfillmentOrder(id, body, request.authContext, callerContextOf(request))`.
  4. If `refused(response, result)` returns true, it stops without sending anything further. Otherwise it sends `createdResponse<Shipment>` with `result.data` and the location `/delivery/shipments/${result.data.id}`.
  5. Any thrown error goes to `catchAs(response, 'postShipFulfillmentOrder')`.

## Relationships
- `src/infrastructure/http/controller.ts`: supplies `parseBody` (schema validation), `refused` (turns a refused service result into a response) and `catchAs` (error handler).
- `src/infrastructure/http/ids.ts`: `requireId` extracts and validates the path id.
- `src/infrastructure/http/request.ts`: `callerContextOf` builds the caller context passed to the service.
- `src/infrastructure/http/response.ts`: `createdResponse` builds the 201 response with a location.
- `src/modules/delivery/services/index.ts`: exports `deliveryService`, whose `shipFulfillmentOrder` method is called here and holds the business logic.
- `src/types/index.ts`: provides the `Shipment` type used for the response payload.
- `src/modules/delivery/routes.ts`: not imported here. It is presumably where the handler is mounted on the path above.

## Notes
- Every code path returns a Promise. Early exits return `Promise.resolve()`, so the handler can be awaited uniformly.
- `requireId` and `parseBody` write the error response themselves and return a falsy value. The handler only checks the return value and bails out.
- A missing body is treated as `{}` before validation, so the schema decides whether an empty body is acceptable.
- The handler contains no business rules. Which quantities can be shipped is decided in the service.
- The request body schema `ShipFulfillmentOrderBody` is imported from `@api/schemas.zod`.
