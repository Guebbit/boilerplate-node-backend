---
source: src/modules/delivery/controllers/patch-shipment.ts
source_sha256: be897a5fa5b67fe5ff7eef70be82a4a748d17b0733a7aa6a215a98f1ba4ba2f8
context_sha256: d20ed8776531d90a15f5260e7dd361e9130b85be2227e7c2a00943e38ea0b723
generated_at: 2026-11-22T04:46:13.800633+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/controllers/patch-shipment.ts

## Purpose
Express controller for `PATCH /delivery/shipments/:id`, used by staff to correct a shipment's tracking code. It validates the id and body, delegates the update to the delivery service, and sends back the updated shipment.

## Key elements
- `patchShipment(request, response)`: the only export. It does the following:
  1. Resolves the shipment id with `requireId`, using the not-found key `delivery.shipment-not-found`. If that fails, it returns an already-resolved promise.
  2. Validates `request.body` against `UpdateShipmentBody` (imported from `@api/schemas.zod`) with `parseBody`. If that fails, it returns an already-resolved promise.
  3. Calls `deliveryService.editShipmentTracking(id, body.trackingCode, request.authContext, callerContextOf(request))`.
  4. If `refused(response, result)` handles the result, it stops. Otherwise it responds with `successResponse<Shipment>(response, result.data)`.
  5. Passes any rejection to `catchAs(response, 'patchShipment')`.

## Relationships
- `@infrastructure/http/controller` (`src/infrastructure/http/controller.ts`): supplies `parseBody`, `refused` and `catchAs`.
- `@infrastructure/http/ids` (`src/infrastructure/http/ids.ts`): supplies `requireId`.
- `@infrastructure/http/request` (`src/infrastructure/http/request.ts`): supplies `callerContextOf`.
- `@infrastructure/http/response` (`src/infrastructure/http/response.ts`): supplies `successResponse`.
- `../services` (`src/modules/delivery/services/index.ts`): supplies `deliveryService`, which holds the business logic in `editShipmentTracking`.
- `@types` (`src/types/index.ts`): supplies the `Shipment` type used for the response.
- `src/modules/delivery/routes.ts`: this is the route registration module for the delivery module. The controller itself does not import it, so the link is through the dependency graph only. The file doesn't show how the route is wired.

## Notes
- The handler deliberately has no `If-Match` / optimistic-concurrency check. Only the tracking code can be changed, so the last write wins.
- It returns a promise, not an async function. Early validation exits return `Promise.resolve()` after the helper has already written the error response.
- `request.authContext` is passed to the service directly. The handler does no authorization checks itself, so any enforcement happens in the service or in upstream middleware.
