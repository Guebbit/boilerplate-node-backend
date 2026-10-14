---
source: src/modules/delivery/controllers/post-deliver-shipment.ts
sha256: ca516fb1b9377d0c169730f99ff60b68e4a1c26a8a741118a8925aa47df339a8
generated_at: 2026-10-14T15:20:58.923294+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/controllers/post-deliver-shipment.ts

## Purpose

Route handler for `POST /delivery/shipments/:id/deliver`. Accepts a staff's delivery confirmation for a shipment, validates the input, and delegates to the delivery service to record the arrival — which, when it is the final shipment, transitions the order from `shipped` to `delivered`.

## Key elements

- **`postDeliverShipment(request, response)`** (exported) — The Express handler. Resolves the shipment `id` from the route param, parses/validates the request body against `DeliverShipmentBody`, calls `deliveryService.deliverShipment(id, body, request.authContext, callerContextOf(request))`, then either signals refusal or sends the resulting `Shipment` via `successResponse`.

## Relationships

- **`@infrastructure/http/controller`** (`src/infrastructure/http/controller.ts`) — Provides the shared controller utilities: `parseBody` (Zod validation), `refused` (domain-rejection → HTTP mapping), and `catchAs` (error → HTTP mapping with a context tag).
- **`@infrastructure/http/ids`** (`src/infrastructure/http/ids.ts`) — `requireId` extracts and validates the `:id` route parameter, returning `null` (and a 404) if missing.
- **`@infrastructure/http/request`** (`src/infrastructure/http/request.ts`) — `callerContextOf` derives the caller's audit context from the request.
- **`@infrastructure/http/response`** (`src/infrastructure/http/response.ts`) — `successResponse` formats the 200 reply.
- **`../services`** (`src/modules/delivery/services/index.ts`) — `deliveryService.deliverShipment` performs the actual domain work; this controller is a thin HTTP wrapper around it.
- **`src/modules/delivery/routes.ts`** — Registers `postDeliverShipment` on the `POST /delivery/shipments/:id/deliver` route.
- **`@types`** (`src/types/index.ts`) — Provides the `Shipment` type used to type the success response payload.

## Notes

- The Express generic types the route param as optional (`id?: string`); actual enforcement is done at runtime by `requireId`.
- `request.authContext` is read directly (not via a helper) and forwarded to the service — the service, not the controller, decides how that context is used for authorization.
- On both early-exit paths (missing id, invalid body) the handler returns `Promise.resolve()` rather than throwing, keeping the error-response responsibility with the infrastructure helpers.
