---
source: src/modules/inventory/controllers/list-product-availability.ts
source_sha256: e1bd39106b575519b13e83331cc4249be30ed9af79c45f7ecf1935ee85e179be
context_sha256: a0bcb1dd7ea450b81288bf24ad02027e7309f7e96c5ad848de341f939d0f200c
generated_at: 2026-11-22T05:17:15.988646+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/controllers/list-product-availability.ts

## Purpose
Express controller for `GET /products/availability?id=a&id=b`. It returns the availability of many products in one call, "as the caller may see it". It validates the query, delegates to the availability service, and sends the result or an error.

## Key elements
- `listProductAvailabilityItems(request, response)`: the only export, and the route handler.
  - Reads input with `readInput(request, { surface: 'list', stringArrays: ['id'] })`. The `stringArrays` option keeps every repeated `id` value instead of only the first.
  - Validates that input with `parseBody(ListProductAvailabilityQueryParams, ..., response)`. If validation fails it returns `Promise.resolve()` and does nothing further.
  - Calls `listProductAvailability(query.id ?? [], request.caller)`.
  - If `refused(response, result)` is true, it returns early. Otherwise it sends `successResponse<ProductAvailabilityResponse>(response, result.data)`.
  - Any rejection goes to `catchAs(response, 'listProductAvailability')`.

## Relationships
- `src/infrastructure/http/request.ts`: supplies `readInput`, which turns the request into the input object.
- `src/infrastructure/http/response.ts`: supplies `successResponse`, which sends the success payload.
- `src/infrastructure/http/controller.ts`: supplies `parseBody` (schema validation), `refused` (handles refused service results) and `catchAs` (error handling).
- `src/modules/inventory/services/availability.ts`: supplies `listProductAvailability`, which does the work. The controller passes it the ids and the caller.
- `src/types/index.ts`: supplies the `ProductAvailabilityResponse` type, imported as `@types`.
- `src/modules/inventory/availability-routes.ts`: the route file in the same module. It is the likely place this handler is registered, but the controller itself does not show that wiring.

## Notes
- A missing `id` is treated as an empty list (`query.id ?? []`).
- The service result is checked with `refused` before `result.data` is used. The service can therefore refuse a request, and the shared helper writes that response.
- The handler always returns a Promise, including on validation failure.
