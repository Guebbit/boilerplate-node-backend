---
source: src/modules/delivery/controllers/post-hold-fulfillment-order.ts
source_sha256: 5c406d4943a3a48d646b3d4b0e60ba13d348aa0ed59e4db18f6201f04e60f10f
context_sha256: d20ed8776531d90a15f5260e7dd361e9130b85be2227e7c2a00943e38ea0b723
generated_at: 2026-11-22T04:46:38.658992+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/controllers/post-hold-fulfillment-order.ts

## Purpose
Express controllers for staff placing a fulfillment order on hold (`POST /delivery/fulfillment-orders/:id/hold`) and releasing it (`POST /delivery/fulfillment-orders/:id/release`). They validate input, delegate to `deliveryService`, and format the HTTP response.

## Key elements
- `postHoldFulfillmentOrder(request, response)`: Resolves the `:id` param with `requireId` (not-found key `delivery.fulfillment-order-not-found`). It validates `request.body` against `HoldFulfillmentOrderBody` (imported from `@api/schemas.zod`) via `parseBody`, then calls `deliveryService.holdFulfillmentOrder(id, body, request.authContext, callerContextOf(request))`.
- `postReleaseFulfillmentOrder(request, response)`: Same `:id` handling, but takes no body. It calls `deliveryService.releaseFulfillmentOrder(id, request.authContext, callerContextOf(request))`.

Both return a Promise. On success they send `successResponse<FulfillmentOrder>(response, result.data)`.

## Relationships
- `src/infrastructure/http/controller.ts`:
  - `parseBody` validates the request body.
  - `refused` short-circuits when the service result is a refusal.
  - `catchAs` builds the `.catch` handler, tagged with the controller name.
- `src/infrastructure/http/ids.ts`: `requireId` extracts and validates the route id.
- `src/infrastructure/http/request.ts`: `callerContextOf` derives the caller context passed to the service.
- `src/infrastructure/http/response.ts`: `successResponse` writes the success payload.
- `src/modules/delivery/services/index.ts`: `deliveryService` implements `holdFulfillmentOrder` and `releaseFulfillmentOrder`.
- `src/types/index.ts`: provides the `FulfillmentOrder` type used for the response.
- `src/modules/delivery/routes.ts`: the route module that exposes these handlers. Its wiring is not visible in this file.

## Notes
- Early exits (invalid id, invalid body) return `Promise.resolve()`. The helpers `requireId` and `parseBody` write the error response themselves. The handler returns when they yield a falsy value.
- A refused service result is handled by `refused(response, result)` before `result.data` is read.
- Errors are not thrown to Express. They are caught by `catchAs`.
