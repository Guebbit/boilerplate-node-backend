---
source: src/modules/wishlist/controllers/post-move-to-cart.ts
sha256: 674ed292d64d191cd32380d2d641c126f60069ef617c18ea24eb96a4779716ea
generated_at: 2026-09-23T19:46:44.261262+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/controllers/post-move-to-cart.ts

## Purpose

Thin HTTP adapter for the `POST /wishlist/:productId/move-to-cart` endpoint. Extracts the caller's identity and product ID from the request, validates the ID, delegates to `wishlistService.wishlistMoveToCart`, and formats the HTTP response. It contains no business logic.

## Key elements

- **`postMoveToCart(request, response)`** — The sole export. Reads `userId` from `request.authContext` and `productId` from the URL params, validates the ID with `requireObjectId`, calls the service with the caller context, then either sends a `200` success (via `successResponse<WishlistResponse>`) or handles refusal/error paths.

## Relationships

- **`@infrastructure/http/controller`** — Uses `refused` to short-circuit on service-level rejections and `catchAs` as the unified error handler for the async chain.
- **`@infrastructure/http/request`** — Uses `requireObjectId` to validate the `productId` param and `callerContextOf` to forward tracing/correlation metadata into the service call.
- **`@infrastructure/http/response`** — Uses `successResponse` to shape the final `WishlistResponse` body with a 200 status and optional message.
- **`../service` (`wishlistService`)** — The only business-logic dependency; calls `wishlistMoveToCart(userId, productId, callerContext)`.
- **`@types`** — Imports the `WishlistResponse` type used to type the success payload.
- **`../routes.ts`** — Registers this handler on the `POST /wishlist/:productId/move-to-cart` route (implied by the path comment; the route file wires it to the HTTP layer).

## Notes

- The controller assumes `request.authContext` is already populated (non-null assertion `!`). Authentication middleware is expected upstream.
- Operation ordering guarantee (cart write before wishlist removal) is enforced in the **service**, not here. The controller comment references this but does not implement it.
- Follows the standard controller pattern: validate → call service → `refused` check → success or `catchAs`. Keep new wishlist controllers consistent with this shape.
