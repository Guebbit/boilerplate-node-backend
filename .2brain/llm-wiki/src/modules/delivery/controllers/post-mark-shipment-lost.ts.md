---
source: src/modules/delivery/controllers/post-mark-shipment-lost.ts
sha256: 528160bffe2448bcd9bf162bf41088f0a6a3c009a785fb297feab9a6e51931f1
generated_at: 2026-10-29T03:32:16.543532+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/controllers/post-mark-shipment-lost.ts

## Purpose
Controller handler for `POST /delivery/shipments/:id/lost`. It validates the request (path ID, JSON body) and delegates to the delivery service so staff can mark a shipment as lost or damaged in transit.

## Key elements
- **`postMarkShipmentLost`** — the sole export; Express-compatible handler that extracts the shipment ID, parses the request body against `MarkShipmentLostBody` (zod), calls `deliveryService.markShipmentLost`, and emits either a `successResponse` carrying a `Shipment` or an early-return refusal/error via the shared controller helpers.

## Relationships
- **`@infrastructure/http/controller`** (`src/infrastructure/http/controller.ts`) — supplies `catchAs`, `parseBody`, and `refused` used for body validation, refusal signalling, and error formatting.
- **`@infrastructure/http/ids`** (`src/infrastructure/http/ids.ts`) — `requireId` resolves and validates the `:id` path parameter, short-circuiting with a 404 (`delivery.shipment-not-found`) when absent.
- **`@infrastructure/http/request`** (`src/infrastructure/http/request.ts`) — `callerContextOf` extracts the authenticated caller's context to pass into the service call.
- **`@infrastructure/http/response`** (`src/infrastructure/http/response.ts`) — `successResponse` serialises the successful `Shipment` payload.
- **`src/modules/delivery/services/index.ts`** — `deliveryService.markShipmentLost(id, body, authContext, callerContext)` performs the actual state transition.
- **`src/types/index.ts`** — `Shipment` type used as the generic parameter of the success response.
- **`src/modules/delivery/routes.ts`** — route registration file that wires this handler to the `POST /delivery/shipments/:id/lost` path.

## Notes
- The handler follows the project's "guard-then-return" pattern: each validation step (`requireId`, `parseBody`) returns `Promise.resolve()` on failure so Express can proceed without awaiting further logic.
- The request type parameter uses a partial `params` shape (`{ id?: string }`) because Express cannot guarantee the param is present until `requireId` checks it.
- `request.authContext` is passed directly into the service call (not re-extracted here), implying the auth middleware sets it upstream.
