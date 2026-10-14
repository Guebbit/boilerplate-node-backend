---
source: src/modules/delivery/controllers/post-fulfill-fulfillment-order.ts
sha256: 33f314a674f542e660d50fe51b1f8dc06512b9aec9ff9d30e43e70d452895867
generated_at: 2026-10-14T15:21:13.795806+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/controllers/post-fulfill-fulfillment-order.ts

## Purpose

Controller handler for `POST /delivery/fulfillment-orders/:id/fulfill`. It validates the order ID, delegates to the delivery service to fulfill a digital fulfillment order (a shipment with no parcel, "born delivered"), and writes the resulting `Shipment` to the HTTP response.

## Key elements

- **`postFulfillFulfillmentOrder(request, response)`** — The sole export. Reads `:id` from the route params, calls `deliveryService.fulfillFulfillmentOrder`, then either short-circuits via `refused` or sends a `successResponse` containing the `Shipment`. Errors are funnelled through `catchAs`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Provides `catchAs` (error-to-HTTP translation) and `refused` (service-level refusal check used to skip the success path).
- **`src/infrastructure/http/ids.ts`** — Provides `requireId`, which extracts and validates the `:id` param, returning `null` and a 404 on failure.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf`, which builds caller context passed into the service call.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse`, the standard 200 JSON envelope.
- **`src/modules/delivery/services/index.ts`** — Source of `deliveryService`; this controller calls its `fulfillFulfillmentOrder(id, authContext, callerContext)` method.
- **`src/modules/delivery/routes.ts`** — Presumed registration point that maps the `POST /delivery/fulfillment-orders/:id/fulfill` route to this handler.
- **`src/types/index.ts`** — Source of the `Shipment` type used as the generic parameter of the success response.

## Notes

- The `:id` route param is typed as optional (`id?: string`) on the `Request` generic; `requireId` performs the runtime validation and returns `null` on absence, which the handler treats as an early exit (the 404 is already sent by `requireId`).
- `request.authContext` is accessed directly (not imported from the listed neighbors); it is expected to be attached upstream by auth middleware.
- The domain term "fulfillment order" is distinct from a regular shipment: it has no parcel and is considered delivered at the moment of fulfillment.
