---
source: src/modules/cart/controllers/get-cart-summary.ts
source_sha256: d1136255500308a7152fd85f595d62c066a8b9dce4ebbd0a5128c1f076f4e630
context_sha256: d97e806267cbe458feec236b24690be7dbb45bae4eac1ac386a534692fb24c37
generated_at: 2026-11-22T04:30:29.316347+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/controllers/get-cart-summary.ts

## Purpose
Express controller for `GET /cart/summary`. It is a thin HTTP adapter that returns a lightweight summary of the authenticated user's cart (used for a cart "badge") by delegating to the cart service.

## Key elements
- `getCartSummary(request, response)` — the only export. Calls `cartService.getForBadge(request.authContext!.id)`, then sends `cart.summary` via `successResponse<CartSummaryResponse>`. Errors go to `catchAs(response, 'getCartSummary')`.

## Relationships
- `src/modules/cart/services/index.ts` — supplies `cartService`. The controller uses its `getForBadge` method.
- `src/infrastructure/http/response.ts` — supplies `successResponse`, which writes the success payload.
- `src/infrastructure/http/controller.ts` — supplies `catchAs`, the error handler. It is given the response and the label `'getCartSummary'`.
- `src/types/index.ts` — supplies the `CartSummaryResponse` type (imported as `@types`), which types the response body.
- `src/modules/cart/routes.ts` — the route module for the cart feature. It is the expected place where this handler is mounted at `/cart/summary`.

## Notes
- The handler reads `request.authContext!.id` with a non-null assertion. It assumes that authentication middleware has already populated `authContext`. The file does not check this itself.
- Only `cart.summary` is returned, not the full cart object returned by the service.
- The handler is not `async`. It returns the promise chain directly, with errors handled in `.catch`.
