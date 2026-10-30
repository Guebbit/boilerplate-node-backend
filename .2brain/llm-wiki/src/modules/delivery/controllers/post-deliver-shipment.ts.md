---
source: src/modules/delivery/controllers/post-deliver-shipment.ts
sha256: f3198b90814e991e5a97c2b0a79cb2ebd82187dfc4cb5e94a1aaaee0cea58bcb
generated_at: 2026-10-29T03:31:59.490399+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/controllers/post-deliver-shipment.ts

## Purpose

Thin HTTP controller for `POST /delivery/shipments/:id/deliver`. Staff uses this endpoint to record that a shipment has arrived; when it is the last outstanding shipment on an order, the underlying service transitions the order from `shipped` to `delivered`. All business logic is delegated to `deliveryService.deliverShipment`—this file only wires the HTTP layer to the service.

## Key elements

- **`postDeliverShipment`** (exported const, `Request<{ id?: string }> → Promise<void>`): Validates the `:id` route param via `requireId`, calls `deliveryService.deliverShipment(id, request.authContext, callerContextOf(request))`, then either short-circuits on a refusal (`refused`) or sends a `Shipment` success response. Errors are funneled through `catchAs(response, 'postDeliverShipment')`.

## Relationships

- **`src/modules/delivery/routes.ts`** — Registers this handler on the `POST /delivery/shipments/:id/deliver` route.
- **`src/modules/delivery/services/index.ts`** — Imports `deliveryService`; the sole business-logic dependency.
- **`src/infrastructure/http/controller.ts`** — Provides `catchAs` (standard error → HTTP mapping) and `refused` (detects service-level refusal to short-circuit before success).
- **`src/infrastructure/http/ids.ts`** — Provides `requireId` to extract and validate the `:id` parameter, returning early with a 404 (`delivery.shipment-not-found`) if absent.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf` to derive a caller/context object passed into the service.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse` for the standard success envelope.
- **`src/types/index.ts`** — Supplies the `Shipment` type used as the response payload type parameter.

## Notes

- `request.authContext` is passed straight through to the service; it is expected to be populated by an upstream middleware (not visible in this file).
- The controller follows the project's `refused` / `catchAs` idiom rather than `try/catch`, so new error cases should be handled in the service or in the shared `controller.ts` helpers, not here.
- The state transition (`shipped → delivered`) is the responsibility of `deliveryService.deliverShipment`; this file contains no order-state logic.
