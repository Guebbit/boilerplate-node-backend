---
source: src/modules/delivery/controllers/post-ship-fulfillment-order.ts
sha256: 993a05cbd42fae3df04e61042dbaccb2206b9a49fdc2b0201abee539d7385a53
generated_at: 2026-11-08T05:27:58.827312+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/controllers/post-ship-fulfillment-order.ts

## Purpose

HTTP controller that handles `POST /delivery/fulfillment-orders/:id/shipments`. It validates the request, delegates to the delivery service to cut one or more shipments from the remaining quantity of a fulfillment order, and returns the created shipment.

## Key elements

- **`postShipFulfillmentOrder`** *(exported)* — Express handler. Extracts the `:id` param, parses the JSON body against the `ShipFulfillmentOrderBody` Zod schema, calls `deliveryService.shipFulfillmentOrder`, and responds with **201 Created** (body: `Shipment`, `Location: /delivery/shipments/:shipmentId`).

## Relationships

- **`src/infrastructure/http/controller.ts`** — supplies the `catchAs`, `parseBody`, and `refused` helpers used for uniform error/rejection handling.
- **`src/infrastructure/http/ids.ts`** — supplies `requireId`, which extracts and validates the `:id` route param.
- **`src/infrastructure/http/request.ts`** — supplies `callerContextOf`, passed into the service call as an audit/caller context.
- **`src/infrastructure/http/response.ts`** — supplies `createdResponse`, which sends the 201 + `Location` header.
- **`src/modules/delivery/services/index.ts`** — provides `deliveryService.shipFulfillmentOrder`, the actual business logic.
- **`src/modules/delivery/routes.ts`** — registers this handler on the Express router for the target path.
- **`src/types/index.ts`** — source of the `Shipment` return type used in the response.

## Notes

- The `id` param is typed as optional (`{ id?: string }`); `requireId` is responsible for the 404 short-circuit, so the handler can be wired even before the param is present.
- `refused(response, result)` is checked **before** the success response, meaning the service can return a structured "rejected" outcome (e.g., order already fully shipped) without throwing.
- The Zod schema (`ShipFulfillmentOrderBody`) is imported from `@api/schemas.zod` (not listed in the graph neighbors above); it defines the accepted line-item shape for partial or full shipment.
