---
source: src/modules/delivery/controllers/post-mark-shipment-lost.ts
source_sha256: 9a43caf501b288b85316dbd7790b56524a549e7040125720e1391164881ea25f
context_sha256: d20ed8776531d90a15f5260e7dd361e9130b85be2227e7c2a00943e38ea0b723
generated_at: 2026-11-22T04:46:49.516502+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/controllers/post-mark-shipment-lost.ts

## Purpose
Express controller for `POST /delivery/shipments/:id/mark-lost`. It lets staff report a parcel as lost or damaged in transit by validating the request and delegating to the delivery service.

## Key elements
- `postMarkShipmentLost(request, response)`: the exported handler. It runs these steps in order:
  1. Reads the shipment id with `requireId`, using the not-found key `delivery.shipment-not-found`. If the id is missing or invalid, it stops, since `requireId` has already handled the response.
  2. Validates `request.body` against the `MarkShipmentLostBody` zod schema (from `@api/schemas.zod`) with `parseBody`. If validation fails, it stops.
  3. Calls `deliveryService.markShipmentLost(id, body, request.authContext, callerContextOf(request))`.
  4. If `refused(response, result)` reports a refusal, it returns without sending a success response. Otherwise it sends `successResponse<Shipment>(response, result.data)`.
  5. Any rejection is passed to `catchAs(response, 'postMarkShipmentLost')`.

## Relationships
- `src/infrastructure/http/controller.ts`: provides `parseBody`, `refused` and `catchAs`, which handle validation, refused service results and error responses.
- `src/infrastructure/http/ids.ts`: `requireId` extracts the `:id` param and responds with the not-found key when it is absent.
- `src/infrastructure/http/request.ts`: `callerContextOf` builds the caller context passed to the service.
- `src/infrastructure/http/response.ts`: `successResponse` formats the success payload.
- `src/modules/delivery/services/index.ts`: supplies `deliveryService`, which holds the actual business logic in `markShipmentLost`.
- `src/types/index.ts`: supplies the `Shipment` type for the response payload.
- `src/modules/delivery/routes.ts`: the route table, which presumably registers this handler for the path above. The file itself doesn't show the wiring.

## Notes
- The handler never throws and always returns a Promise. Early exits return `Promise.resolve()`.
- Errors and refusals are written to the response by the helpers rather than thrown. The controller itself contains no business rules.
- `request.authContext` is passed straight through. This file does no authorization checks of its own.
