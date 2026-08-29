# src/modules/cart/controllers/get-cart-summary.ts

## Purpose

Express controller handler for `GET /cart/summary`. It retrieves the authenticated user's cart and returns only the lightweight `summary` portion (intended for badge/count UIs), keeping the payload smaller than a full cart fetch.

## Key elements

- **`getCartSummary(request, response)`** — Exposed as the route handler. Resolves the user ID via `authContextOf(request)`, calls `cartService.cartGetForBadge(id)`, and sends `cart.summary` back through `successResponse`. Errors are funneled to `catchAs`.

## Relationships

- **`src/infrastructure/http/request.ts`** — Uses `authContextOf` to extract the authenticated user's ID from the incoming request.
- **`src/infrastructure/http/response.ts`** — Uses `successResponse` to shape the HTTP 200 reply.
- **`src/infrastructure/http/controller.ts`** — Uses `catchAs` as the unified rejection handler so error formatting stays consistent across controllers.
- **`src/modules/cart/services/index.ts`** — Calls `cartService.cartGetForBadge(id)`; the sole domain-level dependency.
- **`src/modules/cart/routes.ts`** — Registers `getCartSummary` as the handler for the `GET /cart/summary` route.

## Notes

- Only `cart.summary` is sent to the client, not the full cart object. Consumers expecting line items must hit a different endpoint.
- Follows the project's `.then().catch(catchAs(response, 'opName'))` controller pattern rather than `async/await` — keep new controllers consistent with this style.
