---
source: src/modules/shop/controllers/get-shop.ts
sha256: 36295664743ab226926740f0d84da9878a6a3d73072427d9b5206a2240a44ea3
generated_at: 2026-10-29T05:51:45.412489+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop/controllers/get-shop.ts

## Purpose

Handler for the public `GET /shop` endpoint. It returns the shop's identity, shipping/return addresses, and trade currency so that any caller can identify the seller before making a purchase. No authentication is required by design.

## Key elements

- **`getShop`** (exported) — Express route handler for `GET /shop`. Resolves the shop record via the service layer and sends it back as a `successResponse<Shop>`. The request parameter is unused (`_request`).

## Relationships

- **`src/modules/shop/routes.ts`** — Registers `getShop` as the handler for the `GET /shop` route.
- **`src/modules/shop/service.ts`** — Provides `getShop` (aliased `readShop`) which actually fetches the shop's settings.
- **`src/infrastructure/http/response.ts`** — Supplies `successResponse` used to shape the JSON reply.
- **`src/infrastructure/http/controller.ts`** — Supplies `catchAs`, which the `.catch` branch uses to serialise unexpected errors into a consistent error envelope.
- **`src/types/index.ts`** — Source of the `Shop` type that parameterises `successResponse`.

## Notes

- Uses the `Promise.resolve().then(…).catch(catchAs(…))` idiom instead of `async/await`/`try-catch`. This is the shared pattern for controllers in this codebase; `catchAs` tags the operation name (`'getShop'`) into the error payload.
- The underlying read (`readShop()`) is synchronous; the Promise chain exists solely to funnel it through the shared `catchAs` error formatter.
