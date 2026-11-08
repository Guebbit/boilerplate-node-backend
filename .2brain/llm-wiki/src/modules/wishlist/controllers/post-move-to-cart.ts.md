---
source: src/modules/wishlist/controllers/post-move-to-cart.ts
sha256: 9725dd81738f4d7b55c4f6405f0444bedffbbab9582d7ca6cc419919dadaf60f
generated_at: 2026-11-08T09:12:06.940243+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/controllers/post-move-to-cart.ts

## Purpose

Thin HTTP adapter for `POST /wishlist/items/:productId/move-to-cart`. It extracts the authenticated user and the `productId` path param, then delegates all business logic (cart line creation/increment + wishlist item removal) to `wishlistService.moveToCart`. It exists solely to translate between Express request/response objects and the service's typed API.

## Key elements

- **`postMoveToCart`** (exported) — the Express handler. Reads `userId` from `request.authContext`, validates `productId` via `requireId`, calls the service, and shapes the response (200 success or a refused error). All error handling is delegated to `catchAs`.

## Relationships

- **`@infrastructure/http/request`** — `callerContextOf(request)` packages request metadata (IP, user-agent, etc.) passed into the service call.
- **`@infrastructure/http/ids`** — `requireId` validates that `productId` is a well-formed identifier; returns early (sends an error response) if not.
- **`@infrastructure/http/response`** — `successResponse` serialises the `WishlistResponse` payload with a 200 status.
- **`@infrastructure/http/controller`** — `catchAs` is the uniform error-catch wrapper; `refused` inspects the service result for a "refused" signal and short-circuits the success path.
- **`src/modules/wishlist/service.ts`** — the sole business-logic dependency; `moveToCart(userId, productId, callerContext)` is the single call made.
- **`src/modules/wishlist/routes.ts`** — registers `postMoveToCart` as the handler for the route.
- **`src/types/index.ts`** — provides the `WishlistResponse` type used to type the success payload.

## Notes

- **Operation ordering is intentional.** The service writes the cart line *before* removing the wishlist entry. If the second step fails, the shopper can simply retry or delete the cart line — the inverse order would be unrecoverable. The controller does not control this; see the service.
- **`request.authContext!`** uses a non-null assertion, relying on upstream middleware to guarantee authentication before this handler runs.
- **`refused` vs. thrown errors** are two distinct failure channels: `refused` is a domain-level "no, this specific thing is blocked" result handled inline; thrown exceptions are caught generically by `catchAs`.
