---
source: src/modules/delivery/controllers/get-shipment-by-order.ts
sha256: d412e4c496d763c9b6a510eac8883906ab0928fe8e0c62903c1a485bb18916a2
generated_at: 2026-09-23T18:35:18.423786+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/controllers/get-shipment-by-order.ts

## Purpose

Controller for `GET /delivery/order/:orderId`. Returns the parcel associated with a given order — its tracking code and arrival status — consumed by the order page's shipping panel once the order status is `shipped`.

## Key elements

- **`getShipmentByOrder`** (exported) — The sole export. Reads `orderId` from the URL params, delegates to `deliveryService.getForOrder(id, authContext)`, then either short-circuits via `refused` or emits `successResponse<Shipment>`. Errors are funnelled through `catchAs(response, 'getShipmentByOrder')`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Provides the `refused` and `catchAs` helpers used for the error / auth-rejection paths.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse`, the standard success envelope.
- **`src/modules/delivery/service.ts`** — Source of `deliveryService`; the controller calls its `getForOrder` method and passes through the result.
- **`src/modules/delivery/routes.ts`** — Expected to register this handler on the `GET /delivery/order/:orderId` route (the only route this controller serves).
- **`src/types/index.ts`** — Supplies the `Shipment` type used as the generic parameter on the success response.

## Notes

- The param is typed `orderId?: string` (optional) but immediately coerced with `String(...)`, so a missing param would surface as the literal string `"undefined"` rather than a 404 — rely on route-level validation if that matters.
- `request.authContext` is read directly, assuming upstream middleware has already populated it.
- No explicit `try/catch`; all failure handling is delegated to `catchAs`, so the controller stays a single expression.
