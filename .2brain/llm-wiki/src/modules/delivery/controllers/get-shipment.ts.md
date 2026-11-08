---
source: src/modules/delivery/controllers/get-shipment.ts
sha256: 2b7b03553f16d0a769e725951ccfbd595643caa8fd2ccbfb25049ec6978b1ae8
generated_at: 2026-11-08T05:26:49.458709+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/controllers/get-shipment.ts

## Purpose

HTTP controller for the `GET /delivery/shipments/:id` endpoint. It retrieves a single shipment by ID for staff viewing/correction and serializes the result into a standard success or refusal response.

## Key elements

- **`getShipment(request, response)`** (exported) — Validates the `:id` path parameter, calls `deliveryService.getShipment`, then writes either a refusal or a `Shipment`-typed success response. Errors are funnelled through `catchAs(response, 'getShipment')`.

## Relationships

- **`src/modules/delivery/routes.ts`** — Registers `getShipment` on the `GET /delivery/shipments/:id` route.
- **`src/modules/delivery/services/index.ts`** — Provides the `deliveryService` instance whose `getShipment(id, authContext)` method performs the actual data lookup.
- **`src/infrastructure/http/ids.ts`** — Supplies `requireId`, which extracts and validates the `:id` param (returns early with a 404 on failure).
- **`src/infrastructure/http/response.ts`** — Supplies `successResponse`, the standard 200 JSON envelope.
- **`src/infrastructure/http/controller.ts`** — Supplies `catchAs` (error → standard error response) and `refused` (service-level rejection → appropriate status).
- **`src/types/index.ts`** — Exports the `Shipment` interface used as the response payload type.

## Notes

- The early-return path (`if (!id) return Promise.resolve()`) avoids a microtask but keeps the function's return type consistent (`Promise<void>`).
- The service call receives `request.authContext` — the controller itself does no authorization; that is delegated to the service layer.
- `catchAs` is tagged with the string `'getShipment'`, which is used for logging/correlation on the server side.
