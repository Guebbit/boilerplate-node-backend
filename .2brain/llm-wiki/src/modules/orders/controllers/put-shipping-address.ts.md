---
source: src/modules/orders/controllers/put-shipping-address.ts
source_sha256: dff77ca340fa3722672964666685d44f85960f48d83f0f699579eb967aed9f29
context_sha256: 13cd80f2a5bda5d3e372e9d8cf9a97579755f6bc5406bc238b85ff37adefd616
generated_at: 2026-11-22T06:10:09.086263+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/controllers/put-shipping-address.ts

## Purpose
Express controller for `PUT /orders/:id/shipping-address`, used by staff to correct where an unshipped order ships. It is thin wiring onto `orderService.correctShippingAddress`. The route's `requirePermission('update', 'Order')` has already checked that the caller may edit orders.

## Key elements
- `putShippingAddress(request, response): Promise<void>`: the only export. It handles the request in this order:
  1. `requireId` reads the order id from the request, with `orders.not-found` as the not-found key. If there is no id, it stops.
  2. `parseBody` validates `request.body` against `CorrectOrderShippingAddressBody` (from `@api/schemas.zod`). If validation fails, it stops.
  3. It calls `orderService.correctShippingAddress(id, body, callerContextOf(request))`.
  4. If `refused(response, result)` is true, it returns without sending anything further.
  5. Otherwise it calls `respondWithOrder(response, result.data, request.authContext, 'putShippingAddress')`.
  6. Any rejection goes to `catchAs(response, 'putShippingAddress')`.

## Relationships
- `@infrastructure/http/controller` supplies `parseBody`, `refused` and `catchAs`, which handle validation, refusal and error responses.
- `@infrastructure/http/ids` supplies `requireId`, which extracts and validates the `:id` param.
- `@infrastructure/http/request` supplies `callerContextOf`, which builds the caller context passed to the service.
- `./respond` supplies `respondWithOrder`, which serialises the updated order for the response.
- `../services` supplies `orderService`, which performs the correction.
- `../routes` is the neighbor that wires this handler to the route. The handler itself never imports it.

## Notes
- The request has no `If-Match` handling. The source comment gives the reason: there is no GET on this URL, and this is a staff fix-up of a single field.
- The request replaces the address and changes nothing else.
- The handler always returns a `Promise<void>`. Early exits return `Promise.resolve()`, because `requireId` and `parseBody` write the error response themselves.
