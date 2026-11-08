---
source: src/modules/delivery/controllers/post-mark-shipment-lost.ts
sha256: 528160bffe2448bcd9bf162bf41088f0a6a3c009a785fb297feab9a6e51931f1
generated_at: 2026-11-08T05:27:39.139459+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/controllers/post-mark-shipment-lost.ts

## Purpose

HTTP controller for `POST /delivery/shipments/:id/lost`. Validates the request, then delegates to the delivery service to record that a parcel was lost or damaged in transit, responding with the updated shipment.

## Key elements

- **`postMarkShipmentLost`** (exported) — Express handler. Resolves the shipment `id` from the route param, validates the JSON body against the `MarkShipmentLostBody` Zod schema, calls `deliveryService.markShipmentLost`, and writes the success or refusal response. Errors are funnelled through `catchAs`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — source of `parseBody`, `refused`, and `catchAs` used for request validation and error formatting.
- **`src/infrastructure/http/ids.ts`** — provides `requireId`, which extracts and validates the `:id` param (404 on missing/invalid).
- **`src/infrastructure/http/request.ts`** — provides `callerContextOf` to derive caller metadata passed into the service call.
- **`src/infrastructure/http/response.ts`** — provides `successResponse` for the 200 JSON envelope.
- **`src/modules/delivery/services/index.ts`** — exports `deliveryService`, whose `markShipmentLost` method performs the actual domain operation.
- **`src/modules/delivery/routes.ts`** — registers this handler on the `POST /delivery/shipments/:id/lost` route.
- **`src/types/index.ts`** — supplies the `Shipment` type used to type the success payload.

## Notes

- Validation failures (bad id, bad body) return early with `Promise.resolve()` rather than throwing; the Express response is already sent by the helper.
- The service is called with `request.authContext` *and* `callerContextOf(request)` as separate arguments—do not conflate them; the former is the authenticated principal, the latter is operational caller metadata.
- `refused` short-circuits before `successResponse`, meaning the service can signal a business-level denial (e.g. shipment already delivered) that the controller translates to a non-2xx without an exception.
