---
source: src/modules/delivery/controllers/patch-shipment.ts
sha256: 360e20d5dee6f1dcdd16febc1487a6bd35e93d72b1ef9836d010904bf1a16139
generated_at: 2026-10-14T15:20:28.959443+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/controllers/patch-shipment.ts

## Purpose

HTTP controller for `PATCH /delivery/shipments/:id`. It lets staff correct a shipment's tracking code by validating the ID and request body, delegating to the delivery service, and returning the updated shipment or an appropriate error.

## Key elements

- **`patchShipment(request, response)`** — The sole export. Resolves the shipment ID, parses the body against the `UpdateShipmentBody` Zod schema, calls `deliveryService.editShipmentTracking`, and sends either a success response with the updated `Shipment` or a refusal/error.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Provides the `catchAs`, `parseBody`, and `refused` helpers that structure the controller's validation and error flow.
- **`src/infrastructure/http/ids.ts`** — Provides `requireId`, which extracts and validates the `:id` route parameter (returning a 404 with the `delivery.shipment-not-found` code if missing).
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf`, used to attach caller/audit context when invoking the service.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse`, used to emit the final `Shipment` payload.
- **`src/modules/delivery/services/index.ts`** — Exposes `deliveryService.editShipmentTracking`, the business-logic call this controller delegates to.
- **`src/modules/delivery/routes.ts`** — Registers `patchShipment` on the `PATCH /delivery/shipments/:id` route.
- **`src/types/index.ts`** — Supplies the `Shipment` type used in the success response generic.

## Notes

- The Express `Request` generic marks `id` as optional (`{ id?: string }`), but `requireId` enforces its presence at runtime; the early-return pattern (`Promise.resolve()`) short-circuits when validation fails so no further processing occurs.
- `request.authContext` is passed through to the service but is not typed in this file's imports—it's expected to be present on the Express request object (likely attached by upstream middleware).
- Error handling is entirely delegated to `catchAs`, keyed by the string `'patchShipment'`; no `try/catch` appears in the controller itself.
