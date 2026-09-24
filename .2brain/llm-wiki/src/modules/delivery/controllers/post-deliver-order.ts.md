---
source: src/modules/delivery/controllers/post-deliver-order.ts
sha256: d2dce0ad16f7bf449ca6912499cb43d8c622e5b66a0afaf67e1546ee903dd3eb
generated_at: 2026-09-23T18:35:34.865933+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/controllers/post-deliver-order.ts

## Purpose

HTTP controller for `POST /delivery/order/:orderId/deliver`. Validates the request body against a Zod schema, then delegates to the delivery service to record a parcel's arrival — the sole transition that moves an order from `shipped` to `delivered`.

## Key elements

- **`postDeliverOrder`** (exported) — Express handler. Validates the body with `DeliverOrderBody`, extracts the caller context, calls `deliveryService.recordDelivery(orderId, callerContext, forced, reason)`, and either returns a success payload or a refusal. Errors are funneled through `catchAs`.

## Relationships

- **`src/modules/delivery/routes.ts`** — registers `postDeliverOrder` on the `POST /delivery/order/:orderId/deliver` route.
- **`src/modules/delivery/service.ts`** — provides `deliveryService.recordDelivery`, the domain logic this handler delegates to.
- **`src/infrastructure/http/controller.ts`** — supplies the `parseBody`, `refused`, and `catchAs` helpers used for validation, error mapping, and exception capture.
- **`src/infrastructure/http/request.ts`** — supplies `callerContextOf` to extract authenticated caller identity from the request.
- **`src/infrastructure/http/response.ts`** — supplies `successResponse` for the standard success envelope.
- **`src/types/index.ts`** — provides the `Shipment` type used as the response payload shape.

## Notes

- `orderId` in the params type is optional (`orderId?: string`); the handler coerces it with `String(request.params.orderId)`, so a missing param yields the literal string `"undefined"` passed downstream rather than an early 400. Rely on the route definition (or middleware) to guarantee its presence.
- The body carries `forced` and `reason` fields, indicating a "forced delivery" path that presumably bypasses normal state-precondition checks inside the service.
