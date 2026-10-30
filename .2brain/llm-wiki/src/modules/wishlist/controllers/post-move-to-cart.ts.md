---
source: src/modules/wishlist/controllers/post-move-to-cart.ts
sha256: 9725dd81738f4d7b55c4f6405f0444bedffbbab9582d7ca6cc419919dadaf60f
generated_at: 2026-10-29T06:33:49.720242+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/controllers/post-move-to-cart.ts

## Purpose

Thin HTTP adapter for `POST /wishlist/items/:productId/move-to-cart`. Extracts the authenticated user and product ID, delegates to `wishlistService.moveToCart`, and shapes the HTTP response (success or refusal). Contains no business logic itself.

## Key elements

- **`postMoveToCart`** (exported function) — the route handler. Reads `request.authContext!.id` for the user, validates `productId` via `requireId`, calls `wishlistService.moveToCart(userId, productId, callerContextOf(request))`, then either rejects via `refused`, responds with `successResponse<WishlistResponse>(…, 200)`, or forwards to `catchAs(response, 'postMoveToCart')` on error.

## Relationships

- **`src/modules/wishlist/service.ts`** — sole business-logic dependency; calls `wishlistService.moveToCart`.
- **`src/modules/wishlist/routes.ts`** — registers this handler on the `POST /wishlist/items/:productId/move-to-cart` route.
- **`src/infrastructure/http/ids.ts`** — provides `requireId` for path-parameter extraction and 404 short-circuit.
- **`src/infrastructure/http/request.ts`** — provides `callerContextOf` (request metadata passed downstream).
- **`src/infrastructure/http/response.ts`** — provides `successResponse` for the 200 JSON envelope.
- **`src/infrastructure/http/controller.ts`** — provides `catchAs` (error-to-HTTP mapping) and `refused` (business-rejection short-circuit).
- **`src/types/index.ts`** — supplies the `WishlistResponse` type used in the success payload.

## Notes

- Response order contract (documented in the docstring): the service writes to cart *before* removing from wishlist, so a failure at the removal step leaves the item in the cart (recoverable) rather than lost. The controller does not enforce or observe this ordering.
- The handler is promise-chained (`.then`/`.catch`), not `async`/`await` — consistent with the project's controller convention.
- Success returns **200**, not 201; the endpoint is a mutation of existing state, not a creation.
- `request.authContext` is accessed with a non-null assertion; the route is expected to sit behind an auth middleware that guarantees its presence.
