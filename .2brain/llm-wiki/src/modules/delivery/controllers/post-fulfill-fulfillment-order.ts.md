---
source: src/modules/delivery/controllers/post-fulfill-fulfillment-order.ts
sha256: 55cba83dc44b644625d68e930a3c1b58e67444e50aa0852fe5dbbc049c3cd37f
generated_at: 2026-10-29T03:32:08.315635+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/controllers/post-fulfill-fulfillment-order.ts

## Purpose

Handles `POST /delivery/fulfillment-orders/:id/fulfill`. A staff user marks a digital fulfillment order (a shipment with no physical parcel) as fulfilled, which creates a new `Shipment` record. The controller extracts the order ID, delegates to the delivery service, and returns the created shipment with a `201` response.

## Key elements

- **`postFulfillFulfillmentOrder(request, response)`** — Exported route handler. Extracts `:id` via `requireId`, calls `deliveryService.fulfillFulfillmentOrder(id, authContext, callerContext)`, then either short-circuits on refusal or emits `201 Created` with a `Location` header pointing to `/delivery/shipments/:shipmentId`.

## Relationships

- **`src/modules/delivery/routes.ts`** — Registers this handler on the `POST /delivery/fulfillment-orders/:id/fulfill` route.
- **`src/modules/delivery/services/index.ts`** — Exports `deliveryService`, whose `fulfillFulfillmentOrder` method performs the actual state transition and returns the new shipment.
- **`src/infrastructure/http/ids.ts`** — Supplies `requireId` to pull and validate the `:id` route param (404 if absent).
- **`src/infrastructure/http/request.ts`** — Supplies `callerContextOf` to derive the caller context passed into the service.
- **`src/infrastructure/http/response.ts`** — Supplies `createdResponse` to build the `201` response with a `Location` header.
- **`src/infrastructure/http/controller.ts`** — Supplies `refused` (early-return guard for rejected results) and `catchAs` (unified error serialization).
- **`src/types/index.ts`** — Provides the `Shipment` type used as the generic parameter of `createdResponse`.

## Notes

- The doc block explicitly calls this a *digital* fulfillment — the resulting shipment has no parcel. Consumers should not expect tracking or carrier fields.
- `request.authContext` is read directly (not through a helper), implying upstream middleware has already resolved it.
- Errors are funneled through `catchAs(response, 'postFulfillFulfillmentOrder')`, which tags the error log with that string — useful for grepping traces.
