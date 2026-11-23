---
source: src/modules/delivery/controllers/get-shipment.ts
source_sha256: 2b7b03553f16d0a769e725951ccfbd595643caa8fd2ccbfb25049ec6978b1ae8
context_sha256: e3b5aee4df95678a1b188e65cab5b1d03dc13ff142e9e0e884f263071f565bce
generated_at: 2026-11-22T04:45:56.758035+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/controllers/get-shipment.ts

## Purpose
Express controller for `GET /delivery/shipments/:id`. It returns a single shipment for staff who may correct it, delegating the lookup and authorization to the delivery service and formatting the HTTP response.

## Key elements
- `getShipment(request, response)` — the only export. It does the following:
  1. Validates the `:id` param with `requireId`, using the not-found key `delivery.shipment-not-found`. If the id is missing or invalid, it returns `Promise.resolve()` and stops. It relies on `requireId` having already written the response.
  2. Calls `deliveryService.getShipment(id, request.authContext)`.
  3. If `refused(response, result)` handles the result, it returns without further output.
  4. Otherwise it sends `successResponse<Shipment>(response, result.data)`.
  5. It attaches `.catch(catchAs(response, 'getShipment'))` to handle errors.

## Relationships
- `src/infrastructure/http/ids.ts` — supplies `requireId`, which parses and validates the route id.
- `src/infrastructure/http/controller.ts` — supplies `refused` (handles refused service results) and `catchAs` (error handler labelled `'getShipment'`).
- `src/infrastructure/http/response.ts` — supplies `successResponse` for the success payload.
- `src/modules/delivery/services/index.ts` — supplies `deliveryService`, which does the business logic and access checks.
- `src/types/index.ts` — supplies the `Shipment` type, imported through the `@types` alias.
- `src/modules/delivery/routes.ts` — the route definitions that mount this handler.

## Notes
- The handler is not `async`. It returns a promise chain, and the early-exit path returns a resolved promise to keep the return type consistent.
- Authorization is carried by `request.authContext` and passed to the service. The controller does not check permissions itself.
