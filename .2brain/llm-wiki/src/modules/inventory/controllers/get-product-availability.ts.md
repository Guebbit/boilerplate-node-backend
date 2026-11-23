---
source: src/modules/inventory/controllers/get-product-availability.ts
source_sha256: 3540432c6f481ae22df5dc7d89039e4706018e9e2a481ede96d780d72264a8cf
context_sha256: 148b6d5080aaf78822a02aeb727251f1618ab06af96a05c2146175abdf8a22a6
generated_at: 2026-11-22T05:16:58.734229+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/controllers/get-product-availability.ts

## Purpose
Express controller for `GET /products/:id/availability`. It returns one product's availability, as visible to the requesting caller, by delegating to the availability service and wrapping the result in the standard success response.

## Key elements
- `getProductAvailabilityItem(request, response)`: the only export. It does the following:
  1. Validates the `:id` param with `requireId`, using the not-found code `products.not-found`. If no id is returned, it resolves immediately and sends nothing itself.
  2. Calls `getProductAvailability(productId, request.caller)`.
  3. If `refused(response, result)` reports a refusal, it returns without further output. Otherwise it sends `successResponse<ProductAvailability>(response, result.data)`.
  4. Any rejection is handled by `catchAs(response, 'getProductAvailability')`.

## Relationships
- `src/infrastructure/http/ids.ts`: provides `requireId`, which validates the route id.
- `src/infrastructure/http/controller.ts`: provides `refused` (handles refused service results) and `catchAs` (error handler labelled with the operation name).
- `src/infrastructure/http/response.ts`: provides `successResponse`.
- `src/modules/inventory/services/availability.ts`: provides `getProductAvailability`, which holds the business logic and is passed the caller.
- `src/types/index.ts`: supplies the `ProductAvailability` type, imported via the `@types` alias.
- `src/modules/inventory/availability-routes.ts`: the routes file in the same module. The controller itself does not import it.

## Notes
- The handler always returns a Promise, resolved early on an invalid id.
- Authorization and visibility are not decided here. The service gets `request.caller` and signals refusal through its result, which `refused` handles.
