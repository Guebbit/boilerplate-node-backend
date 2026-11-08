---
source: src/modules/delivery/controllers/patch-shipment.ts
sha256: 360e20d5dee6f1dcdd16febc1487a6bd35e93d72b1ef9836d010904bf1a16139
generated_at: 2026-11-08T05:27:04.053133+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/controllers/patch-shipment.ts

## Purpose

Controller handler for `PATCH /delivery/shipments/:id`. Validates the shipment ID and the request body, then delegates to the delivery service to update a shipment's tracking code on behalf of a staff member.

## Key elements

- **`patchShipment`** (exported) — Express handler `(request, response) => Promise<void>`. Resolves the `:id` param, validates the body against `UpdateShipmentBody` (Zod schema), calls `deliveryService.editShipmentTracking(id, trackingCode, authContext, callerContext)`, and writes either a success payload (`Shipment`) or a refusal/error response.

## Relationships

- **`src/modules/delivery/routes.ts`** — Registers `patchShipment` as the handler for the `PATCH /delivery/shipments/:id` route.
- **`src/modules/delivery/services/index.ts`** — Provides `deliveryService.editShipmentTracking`, the domain operation that actually performs the update.
- **`src/infrastructure/http/controller.ts`** — Supplies the shared helper trio `requireId`, `parseBody`, `refused`, and `catchAs` used for validation and error mapping.
- **`src/infrastructure/http/ids.ts`** — Source of `requireId`, which extracts and validates the `:id` route parameter.
- **`src/infrastructure/http/request.ts`** — Source of `callerContextOf`, which derives caller metadata from the request for audit/tracing.
- **`src/infrastructure/http/response.ts`** — Source of `successResponse`, the standard JSON success wrapper.
- **`src/types/index.ts`** — Provides the `Shipment` type used in the success response generic.

## Notes

- The handler is synchronous in signature (returns `Promise.resolve()` on early-exit paths) but is wired as an Express async-style handler; the `.catch(catchAs(...))` at the end is the sole error boundary.
- `request.authContext` (not part of the `Request<{ id?: string }>` generic) is passed straight through to the service, meaning auth middleware must have already attached it upstream.
- The `notFound` message key `'delivery.shipment-not-found'` is a localized/centralized error string, not a literal in this file.
