---
source: src/modules/delivery/controllers/post-ship-fulfillment-order.ts
sha256: 993a05cbd42fae3df04e61042dbaccb2206b9a49fdc2b0201abee539d7385a53
generated_at: 2026-10-29T03:32:33.750072+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/controllers/post-ship-fulfillment-order.ts

## Purpose

HTTP controller handler for `POST /delivery/fulfillment-orders/:id/shipments`. It validates the incoming request (path ID, body schema) and delegates the business logic of cutting a shipment from a fulfillment order to the delivery service layer, then maps the result to a `201 Created` response.

## Key elements

- **`postShipFulfillmentOrder`** (exported) — Express route handler. Sequence:
  1. Extracts the `:id` path param via `requireId`; early-returns `Promise.resolve()` on failure.
  2. Validates `request.body` against the `ShipFulfillmentOrderBody` Zod schema via `parseBody`; early-returns on failure.
  3. Calls `deliveryService.shipFulfillmentOrder(id, body, authContext, callerContext)`.
  4. On success, sends `201` with the `Shipment` payload and a `Location` header pointing to `/delivery/shipments/:id`.
  5. Catches all downstream errors via `catchAs(response, 'postShipFulfillmentOrder')`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/delivery/routes.ts` | Registers `postShipFulfillmentOrder` as the handler for the `POST …/shipments` route. |
| `src/modules/delivery/services/index.ts` | Provides `deliveryService.shipFulfillmentOrder`, the core domain operation. |
| `src/infrastructure/http/controller.ts` | Supplies `parseBody`, `refused`, and `catchAs` (shared validation/error helpers). |
| `src/infrastructure/http/ids.ts` | Supplies `requireId` for safe path-param extraction. |
| `src/infrastructure/http/request.ts` | Supplies `callerContextOf` to derive the caller's context for the service call. |
| `src/infrastructure/http/response.ts` | Supplies `createdResponse` to shape the `201` reply. |
| `src/types/index.ts` | Provides the `Shipment` type used in the response generic. |

## Notes

- The handler follows the standard "validate → delegate → respond" pattern shared across other controllers in this module; it contains no business logic itself.
- Early-return uses `Promise.resolve()` (not `response.send`) so the Express async contract is satisfied without a `200`.
- The `authContext` comes from `request.authContext` (set upstream by middleware), while `callerContextOf(request)` provides a separate, derived context object — both are passed to the service.
