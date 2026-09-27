---
source: src/modules/delivery/controllers/get-shipping-methods.ts
sha256: aaed13a1074e6116d04d7ce17e8f7b97c4d3976935ac4614ee1cbf47b4cb8d1e
generated_at: 2026-09-27T14:49:12.871113+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/controllers/get-shipping-methods.ts

## Purpose

Express route handler for `GET /delivery/methods`. Returns the shop's full list of available shipping methods (flat rates and free-above-threshold tiers). It is intentionally public so that guests can see shipping costs before signing up.

## Key elements

- **`getShippingMethods(request, response)`** – The sole export. Calls `deliveryService.listMethods()`, then wraps the result in a `successResponse`. No error branch exists because `listMethods` is documented as always succeeding.

## Relationships

- **`src/modules/delivery/service.ts`** – Calls `deliveryService.listMethods()` to fetch the shipping-method data.
- **`src/infrastructure/http/response.ts`** – Uses `successResponse<ShippingMethodsResponse>` to serialize the JSON envelope and set the HTTP status.
- **`src/types/index.ts`** – Imports the `ShippingMethodsResponse` type that shapes the response payload.
- **`src/modules/delivery/routes.ts`** – Registers this handler at the `GET /delivery/methods` path.

## Notes

- **No weight filtering here.** The original `?weight=` query parameter was removed; weight-fit validation lives on the write side (`PUT /cart/shipping-method`, `POST /cart/checkout`), which checks against the actual basket. Clients should treat the list as "all methods that *could* apply" and rely on the write endpoints for the definitive answer.
- **Always 2xx.** Because `listMethods` has no failure path, this handler never emits an error response. Callers should not write `catch` logic for non-2xx from this endpoint.
