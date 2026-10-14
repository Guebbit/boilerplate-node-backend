---
source: src/modules/delivery/controllers/get-shipping-methods.ts
sha256: 5a57ed6bf61227db7b1f3ff688d9221aad71856115230e24768f471f90200026
generated_at: 2026-10-14T15:20:15.212400+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/controllers/get-shipping-methods.ts

## Purpose

Handler for the public `GET /delivery/methods` endpoint. It returns the shop's full list of available shipping methods (flat rates, free-above thresholds, etc.) so a guest can see shipping costs before signing up or checking out.

## Key elements

- **`getShippingMethods`** (exported) – Express handler. Calls `deliveryService.listMethods()`, then passes `result.data` through `successResponse<ShippingMethodsResponse>`. No query-string parsing, no auth check, no error branch (per the docblock, `listMethods` always succeeds and `data` is always set).

## Relationships

- **`src/infrastructure/http/response.ts`** – Imports `successResponse` to format the JSON envelope for the reply.
- **`src/modules/delivery/routes.ts`** – Registers this handler on the `GET /delivery/methods` route.
- **`src/modules/delivery/services/index.ts`** – Imports `deliveryService`; the handler delegates all business logic to its `listMethods()` call.
- **`src/types/index.ts`** – Imports the `ShippingMethodsResponse` type, used as the generic parameter on `successResponse`.

## Notes

- **No `?weight=` filter.** This is deliberate: the list is advisory/read-only. The authoritative weight-fit check lives server-side in `PUT /cart/shipping-method` and `POST /cart/checkout`, which operate against the real basket.
- **Always 200.** There is no `catch` or 4xx/5xx path in the handler; the service is documented to never reject for this operation.
- **Public endpoint.** No auth middleware is applied here; the intent is that a non-logged-in visitor can still see shipping costs.
