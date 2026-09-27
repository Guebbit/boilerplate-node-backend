---
source: src/modules/wishlist/service.ts
sha256: bbbd2388cc8842b60ec440d0cfa3912181e89729fa2cc73511424c521ea8c28f
generated_at: 2026-09-27T15:46:32.650863+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/service.ts

## Purpose

Service layer for the wishlist module. Translates high-level wishlist operations (get, add, remove, move-to-cart, bulk delete) into repository calls and cross-module interactions, and shapes every result into the `WishlistView` envelope (`{ items: [{ productId }] }`) that the OpenAPI contract requires.

## Key elements

- **`WishlistView`** – Interface matching the `WishlistResponse` schema: an array of `{ productId }` id-only entries.
- **`toWishlistView`** – Mapper that turns a `WishlistDocument` (or `null`) into a `WishlistView`; handles absence as an empty array.
- **`wishlistGet`** – Fetches the user's wishlist; returns an empty view (never 404) when the document is absent or empty.
- **`wishlistAdd`** – Validates the product exists and is publicly visible via `productService.findPublicById`, then adds an idempotent line (`$addToSet`) via the repository.
- **`wishlistRemove`** – Removes a line; returns a 404 reject if the line was not present (signals stale client state).
- **`wishlistMoveToCart`** – Delegates to `cartService.cartItemAddById` first, then removes the wishlist line. Distinguishes cart quantity-limit rejections (passed through) from product-absence (mapped to wishlist 404).
- **`wishlistDeleteByUserId`** – Participates in the caller's Mongoose transaction (`ClientSession`) as part of DDD-D6's `personalData.erase` hook.
- **`productRemoveFromWishlistsById`** – Event-subscription handler that purges a product id from all wishlists when a product is hard-deleted.
- **`wishlistService`** – Barrel object re-exporting all six operations; controllers import this, never the bare functions.

## Relationships

- **`src/modules/products/service.ts`** – Calls `findPublicById` to gate `wishlistAdd` and indirectly `wishlistMoveToCart` (via the cart service's own validation).
- **`src/modules/cart/services/index.ts`** – Calls `cartItemAddById` inside `wishlistMoveToCart`; the cart's success/reject envelope drives the wishlist's response logic.
- **`src/infrastructure/http/response.ts`** – Uses `generateSuccess` / `generateReject` and the `ResponseSuccess` / `ResponseReject` types to build every return value.
- **`src/infrastructure/i18n/index.ts` / `context.ts`** – Calls `t()` for user-facing error and success messages.
- **`src/infrastructure/observability/analytics/index.ts`** – Calls `emitAnalyticsEvent` and `buildAnalyticsBase` after each mutating operation.
- **`src/modules/wishlist/analytics.ts`** – Supplies the `wishlistAnalyticsEvents` enum used as the `event` field in analytics payloads.
- **`src/modules/wishlist/model.ts`** – Imports `WishlistDocument` as the repository return type.
- **`src/modules/wishlist/index.ts`** – Re-exports `wishlistService` for downstream consumers.
- **Controllers** (`get-wishlist.ts`, `post-wishlist.ts`, `delete-wishlist-item.ts`, `post-move-to-cart.ts`) – Call `wishlistService` methods; this file is their sole logic source.

## Notes

- **Id-only responses are contractual.** Shipping full product objects would violate the OpenAPI contract; the client is expected to render from its own product store.
- **Move-to-cart ordering is deliberate.** Cart write happens *before* wishlist removal so a cart failure leaves the saved line intact (retryable). The reverse order risks the one unrecoverable outcome: line deleted but cart add failed.
- **`wishlistMoveToCart` error disambiguation.** A cart reject with code `CART_QUANTITY_LIMIT` is passed through verbatim (the shopper must hear about it); any other cart failure is reinterpreted as the wishlist's own 404 ("product not found"), because a line surviving after a product is deactivated is an intentional state.
- **Idempotency of add.** `$addToSet` means a duplicate add returns the same 200 with no side-effect; no separate "already exists" branch exists.
- **Transaction coupling.** `wishlistDeleteByUserId` does not manage its own session; it joins the caller's (the user-hard-delete flow's) transaction and must be called within it.
