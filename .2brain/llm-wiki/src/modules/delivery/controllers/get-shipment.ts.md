---
source: src/modules/delivery/controllers/get-shipment.ts
sha256: 2b7b03553f16d0a769e725951ccfbd595643caa8fd2ccbfb25049ec6978b1ae8
generated_at: 2026-10-29T03:31:48.660425+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/controllers/get-shipment.ts

## Purpose

Route handler for `GET /delivery/shipments/:id`. Extracts the shipment ID from the request, delegates the lookup to the delivery service, and shapes the HTTP response (success, 404, 403, or error). Exists so the delivery module can expose a single-shipment endpoint for staff correction workflows.

## Key elements

- **`getShipment`** (exported) – Express handler accepting `Request<{ id?: string }>` and `Response`. Validates the `:id` param, calls `deliveryService.getShipment`, then either short-circuits on a refusal or emits `successResponse<Shipment>`.
- **`requireId`** – Imported from `@infrastructure/http/ids`; validates the `:id` param and sends a 404 (i18n key `delivery.shipment-not-found`) if missing/invalid. Returns early to halt the chain.
- **`refused`** – Imported from `@infrastructure/http/controller`; inspects the service result for an authorization denial and writes a 403 before the handler returns.
- **`successResponse`** – Imported from `@infrastructure/http/response`; wraps `result.data` into the module's standard success envelope.
- **`catchAs`** – Imported from `@infrastructure/http/controller`; attached to the `.catch` to map thrown errors to an appropriate error response tagged with `'getShipment'`.

## Relationships

- **`src/modules/delivery/routes.ts`** – Registers `getShipment` as the handler for the `GET /delivery/shipments/:id` route.
- **`src/modules/delivery/services/index.ts`** – Provides `deliveryService.getShipment(id, authContext)`, the actual data access / authorization logic.
- **`src/infrastructure/http/controller.ts`** – Supplies `catchAs` (error mapping) and `refused` (authorization-failure short-circuit).
- **`src/infrastructure/http/ids.ts`** – Supplies `requireId` for param extraction and 404 handling.
- **`src/infrastructure/http/response.ts`** – Supplies `successResponse` for the standard response envelope.
- **`src/types/index.ts`** – Provides the `Shipment` type used to parameterise `successResponse`.

## Notes

- Authorization is **not** checked at the controller level; it is delegated to `deliveryService.getShipment` via `request.authContext`. The controller only reacts to the outcome through `refused`.
- `requireId` both validates the param **and** sends the 404 response; the handler returns `Promise.resolve()` immediately on failure so no further work runs.
- The i18n key `delivery.shipment-not-found` is the single source for the 404 body message—localisation changes go through the key, not this file.
