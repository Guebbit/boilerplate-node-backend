---
source: src/modules/wishlist/controllers/delete-wishlist-item.ts
sha256: 2752d469fd4f30b4c943eb5194f4a5fb3deae8210d77b48404bb0cce7e0f8b3d
generated_at: 2026-10-15T12:25:42.124929+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/controllers/delete-wishlist-item.ts

## Purpose

Thin HTTP adapter for `DELETE /wishlist/:productId`. Validates the path parameter, extracts caller identity and context from the request, and delegates the actual removal to `wishlistService.wishlistRemove`. Exists to keep routing and business logic decoupled.

## Key elements

- **`deleteWishlistItem(request, response)`** – The sole export. Reads `userId` from `request.authContext`, validates `productId` via `requireId`, then calls `wishlistService.wishlistRemove(userId, productId, callerContextOf(request))`.
- **Success path** – Responds with `200` and a `WishlistResponse` payload via `successResponse`.
- **Rejection path** – `refused(response, result)` short-circuits when the service signals a denial (distinct from a 404).
- **Error path** – `.catch(catchAs(response, 'deleteWishlistItem'))` maps unexpected throws to an HTTP error response.

## Relationships

- **`src/modules/wishlist/service.ts`** – Calls `wishlistService.wishlistRemove`; the actual domain logic lives there.
- **`src/modules/wishlist/routes.ts`** – Registers this handler on the `DELETE /wishlist/:productId` route.
- **`src/infrastructure/http/ids.ts`** – `requireId` validates the `productId` param (must be a positive integer) and sends `400`/`404` (`wishlist.not-found`) when invalid.
- **`src/infrastructure/http/request.ts`** – `callerContextOf` builds the context object passed to the service.
- **`src/infrastructure/http/response.ts`** – `successResponse` shapes the 200 reply.
- **`src/infrastructure/http/controller.ts`** – `catchAs` and `refused` centralize error/rejection response formatting.
- **`src/types/index.ts`** – `WishlistResponse` type constrains the success payload.

## Notes

- `request.authContext!.id` uses a non-null assertion; an upstream auth middleware is expected to have populated it before this controller runs.
- A product the caller doesn't own or that no longer exists returns **404**, not 403 — the contract mirrors the cart-remove endpoint so clients can treat "line vanished" uniformly.
- `requireId` will short-circuit the handler (return early) when `productId` is missing or non-numeric, so the service is never called with an invalid id.
