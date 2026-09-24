---
source: src/modules/cart/controllers/get-cart-summary.ts
sha256: 8b1420f0642b4ccc25f06c3d2a46cdc85ae8a443f00f2d3c669add3ce83411c3
generated_at: 2026-09-23T18:29:13.902772+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/controllers/get-cart-summary.ts

## Purpose

Thin HTTP controller for the `GET /cart/summary` endpoint. It extracts the authenticated user's ID, delegates to `cartService.cartGetForBadge`, and sends back only the `summary` portion of the result. All business logic lives in the service layer; this file exists solely to bridge the HTTP boundary.

## Key elements

- **`getCartSummary(request, response)`** — Exported Express handler. Calls `cartService.cartGetForBadge(request.authContext!.id)`, responds with `successResponse<CartSummaryResponse>(response, cart.summary)`, and funnels rejections through `catchAs(response, 'getCartSummary')`.

## Relationships

- **`src/modules/cart/services/index.ts`** — Imports `cartService`; calls `cartGetForBadge` which performs the actual cart lookup.
- **`src/infrastructure/http/response.ts`** — Imports `successResponse` to shape the JSON envelope.
- **`src/infrastructure/http/controller.ts`** — Imports `catchAs` for uniform error serialization.
- **`src/modules/cart/routes.ts`** — Expected to register `getCartSummary` as the handler for `GET /cart/summary`.
- **`src/types/index.ts`** — Imports the `CartSummaryResponse` type used as the generic constraint on the response.

## Notes

- `request.authContext!.id` uses a non-null assertion. The endpoint is presumably protected by an auth middleware that guarantees `authContext` is set; calling this handler without that middleware will throw a runtime error.
- The service returns a larger object, but only `cart.summary` is sent to the client — other fields are intentionally omitted at this layer.
- Error handling is fully delegated to `catchAs`; there is no local `try/catch` or status-code logic in this file.
