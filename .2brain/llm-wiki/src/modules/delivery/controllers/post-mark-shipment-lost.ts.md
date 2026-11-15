---
source: src/modules/delivery/controllers/post-mark-shipment-lost.ts
sha256: 9a43caf501b288b85316dbd7790b56524a549e7040125720e1391164881ea25f
generated_at: 2026-11-14T19:38:10.490244+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/controllers/post-mark-shipment-lost.ts

## Purpose

HTTP controller for `POST /delivery/shipments/:id/mark-lost`. It validates the route parameter and request body, then delegates the actual "mark shipment lost" operation to the delivery service. It exists to keep route-handling logic (parsing, auth, error formatting) separate from domain logic in the service layer.

## Key elements

- **`postMarkShipmentLost(request, response)`** – The sole export. Accepts an Express `Request` with an optional `id` route param and a `Response`. Steps:
  1. Extracts and validates the shipment `id` via `requireId`.
  2. Parses and validates the request body against the `MarkShipmentLostBody` Zod schema.
  3. Calls `deliveryService.markShipmentLost(id, body, authContext, callerContext)`.
  4. On success, sends a `successResponse<Shipment>`; on refusal, delegates to `refused`; on unhandled error, delegates to `catchAs`.

## Relationships

- **`src/infrastructure/http/controller.ts`** – Provides the `parseBody`, `refused`, and `catchAs` helpers that standardise validation, refusal, and error-capture patterns used by every controller in the codebase.
- **`src/infrastructure/http/ids.ts`** – Supplies `requireId`, which extracts the `:id` route param and short-circuits with a 404 if missing.
- **`src/infrastructure/http/request.ts`** – Supplies `callerContextOf`, which pulls the authenticated caller's context from the request to pass alongside `authContext` to the service.
- **`src/infrastructure/http/response.ts`** – Supplies `successResponse`, the standard envelope for 2xx JSON replies.
- **`src/modules/delivery/services/index.ts`** – Exports `deliveryService`; this controller calls `deliveryService.markShipmentLost` on it as the domain operation.
- **`src/modules/delivery/routes.ts`** – Registers this handler for the `POST /delivery/shipments/:id/mark-lost` route.
- **`src/types/index.ts`** – Exports the `Shipment` interface used to type the success response payload.

## Notes

- The controller is deliberately thin: no business rules live here. All mutation logic is in the service.
- Early returns use `Promise.resolve()` (not a bare `return`) so the function's return type stays `Promise<void>` and callers can safely `.then()` it.
- `request.authContext` and `callerContextOf(request)` are passed as *separate* arguments to the service — do not conflate them.
- The route param `id` is typed `string | undefined` in the handler signature; `requireId` narrows it. If you add a new optional param, follow the same pattern.
