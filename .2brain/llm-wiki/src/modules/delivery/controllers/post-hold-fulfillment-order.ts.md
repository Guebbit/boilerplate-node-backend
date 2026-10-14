---
source: src/modules/delivery/controllers/post-hold-fulfillment-order.ts
sha256: 5c406d4943a3a48d646b3d4b0e60ba13d348aa0ed59e4db18f6201f04e60f10f
generated_at: 2026-10-14T15:21:28.177370+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/controllers/post-hold-fulfillment-order.ts

## Purpose
Express route handlers for the two staff-facing endpoints that pause (`hold`) or resume (`release`) a fulfillment order by ID. They validate the request, delegate to the delivery service, and shape the HTTP response.

## Key elements
- **`postHoldFulfillmentOrder`** — `POST /delivery/fulfillment-orders/:id/hold`. Validates the route `id`, parses the JSON body against `HoldFulfillmentOrderBody` (Zod schema from `@api/schemas.zod`), calls `deliveryService.holdFulfillmentOrder`, and returns the updated `FulfillmentOrder`.
- **`postReleaseFulfillmentOrder`** — `POST /delivery/fulfillment-orders/:id/release`. Validates the route `id` (no body required), calls `deliveryService.releaseFulfillmentOrder`, and returns the updated `FulfillmentOrder`.

## Relationships
- **`src/infrastructure/http/controller.ts`** — Provides `catchAs`, `parseBody`, and `refused`, the shared error/validation/response helpers both handlers rely on.
- **`src/infrastructure/http/ids.ts`** — Provides `requireId`, which extracts and validates the `:id` route parameter (sending a 404 with the `delivery.fulfillment-order-not-found` message if missing).
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf`, used to derive caller metadata passed into the service layer.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse`, the standard 200 JSON envelope wrapper.
- **`src/modules/delivery/routes.ts`** — Registers these two handlers to their respective URL paths.
- **`src/modules/delivery/services/index.ts`** — Exposes `deliveryService`, which performs the actual hold/release business logic.
- **`src/types/index.ts`** — Supplies the `FulfillmentOrder` type used as the response payload generic.

## Notes
- The hold handler expects a JSON body (validated via Zod); the release handler does **not** read `request.body` at all.
- Both handlers attach `request.authContext` and `callerContextOf(request)` as service arguments, meaning authorization context is passed explicitly rather than read from a global.
- Early-return guard pattern: if `requireId` or `parseBody` fails, the function returns `Promise.resolve()` after the infrastructure helper has already written the error response — no further processing occurs.
- The `:id` param is typed as `string | undefined` in the Express generic even though `requireId` guarantees its presence after the guard; this is the established convention across the codebase.
