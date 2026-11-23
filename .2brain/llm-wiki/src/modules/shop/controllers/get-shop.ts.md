---
source: src/modules/shop/controllers/get-shop.ts
source_sha256: 36295664743ab226926740f0d84da9878a6a3d73072427d9b5206a2240a44ea3
context_sha256: 13ac38684a82748ce61dc42324d0858d1cc6910ffd247e59ffcf3d1bb3dfad0d
generated_at: 2026-11-22T07:46:47.628788+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/shop/controllers/get-shop.ts

## Purpose
Express controller for the public `GET /shop` endpoint. It returns the shop's own settings: identity, shipping locations, return destinations and trading currency. It is public by design, because the seller must be identifiable before a sale and checkout needs the currency before the caller is known.

## Key elements
- `getShop(_request, response)` — the only export. It calls the service's `getShop` (imported as `readShop`) and sends the result with `successResponse<Shop>`. Any error is passed to `catchAs(response, 'getShop')`.

## Relationships
- `../service` (`src/modules/shop/service.ts`) — supplies the data through `getShop()`, which is called synchronously.
- `@infrastructure/http/response` (`src/infrastructure/http/response.ts`) — provides `successResponse`, which writes the success response.
- `@infrastructure/http/controller` (`src/infrastructure/http/controller.ts`) — provides `catchAs`, the error handler attached to the promise chain and labelled `'getShop'`.
- `@types` (`src/types/index.ts`) — provides the `Shop` type used to type the response payload.
- `src/modules/shop/routes.ts` — the neighbor that wires this handler to the route. This file does not import it.

## Notes
- The request argument is unused (`_request`), so the endpoint takes no input.
- The body is wrapped in `Promise.resolve().then(...)`, so a synchronous throw from `readShop()` is caught by `.catch` rather than escaping the handler.
- No authentication is applied in this file.
