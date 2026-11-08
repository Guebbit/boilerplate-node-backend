---
source: src/modules/shop/controllers/get-shop.ts
sha256: 36295664743ab226926740f0d84da9878a6a3d73072427d9b5206a2240a44ea3
generated_at: 2026-11-08T08:20:16.277994+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop/controllers/get-shop.ts

## Purpose

Public controller for `GET /shop`. Returns the shop's own settings (identity, shipping origin, return address, traded goods, currency) so that a buyer can identify the seller and the checkout flow can resolve currency before any authenticated exchange.

## Key elements

- **`getShop(request, response)`** — The sole export. Reads shop settings via the service layer, wraps them in a `successResponse<Shop>` envelope, and delegates error formatting to `catchAs`. The request object is intentionally unused (prefixed `_`); the endpoint requires no parameters or authentication.

## Relationships

- **`src/modules/shop/service.ts`** — Imports `getShop` (aliased `readShop`) as the data source; this controller is a thin HTTP wrapper over that function.
- **`src/modules/shop/routes.ts`** — Registers this handler at the `GET /shop` route.
- **`src/infrastructure/http/response.ts`** — Uses `successResponse` to shape the JSON envelope.
- **`src/infrastructure/http/controller.ts`** — Uses `catchAs` to convert thrown errors into a consistent HTTP error response.
- **`src/types/index.ts`** — Imports the `Shop` interface, which parameterises the response type.

## Notes

- The handler is fully synchronous in practice (`readShop()` is called inside `Promise.resolve().then(…)`), so the `.catch` branch only fires if `readShop` throws synchronously. There is no async I/O here.
- The endpoint is intentionally public; no auth middleware is expected upstream. Do not add a guard here.
