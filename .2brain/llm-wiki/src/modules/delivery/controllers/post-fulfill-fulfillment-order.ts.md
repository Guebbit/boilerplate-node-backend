---
source: src/modules/delivery/controllers/post-fulfill-fulfillment-order.ts
sha256: 55cba83dc44b644625d68e930a3c1b58e67444e50aa0852fe5dbbc049c3cd37f
generated_at: 2026-11-08T05:27:22.370940+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/controllers/post-fulfill-fulfillment-order.ts

## Purpose

HTTP controller handler for `POST /delivery/fulfillment-orders/:id/fulfill`. Fulfills a *digital* fulfillment order — a shipment with no physical parcel that is born in the delivered state. Delegates the business logic to the delivery service and translates the result into an HTTP response.

## Key elements

- **`postFulfillFulfillmentOrder`** (exported) — Express route handler. Validates the `:id` route param, calls `deliveryService.fulfillFulfillmentOrder`, and returns either a 201 `Created` response with the new `Shipment` (and a `Location` header) or an error/refusal response.

## Relationships

- **`src/modules/delivery/routes.ts`** — registers this handler against the `POST /delivery/fulfillment-orders/:id/fulfill` route.
- **`src/modules/delivery/services/index.ts`** — provides `deliveryService.fulfillFulfillmentOrder(id, authContext, callerContext)`, the actual business logic.
- **`src/infrastructure/http/controller.ts`** — supplies `catchAs` (maps thrown errors to HTTP responses) and `refused` (handles service-level refusal results).
- **`src/infrastructure/http/ids.ts`** — supplies `requireId` to extract and validate the `:id` route param, responding 404 with the `delivery.fulfillment-order-not-found` code if absent.
- **`src/infrastructure/http/request.ts`** — supplies `callerContextOf` to build a caller-context object passed into the service.
- **`src/infrastructure/http/response.ts`** — supplies `createdResponse` to send the 201 body and `Location` header.
- **`src/types/index.ts`** — exports the `Shipment` type used as the response body.

## Notes

- The route-param generic is `{ id?: string }` (optional) because `requireId` is responsible for the 404 guard; the handler early-returns if it is missing.
- Both `request.authContext` *and* `callerContextOf(request)` are passed to the service — the former is the authenticated user, the latter is transport-level caller metadata.
- On success the `Location` header points to `/delivery/shipments/:newId`, not back to the fulfillment-order resource.
- The `catchAs` wrapper keys off the literal string `'postFulfillFulfillmentOrder'`, which is used for structured error tagging/logging.
