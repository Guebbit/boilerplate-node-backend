# src/modules/wishlist/service.ts

## Purpose

Service layer for the wishlist domain. Sits between the wishlist controllers and `wishlistRepository`, enforcing cross-module business rules (product visibility, cart eligibility), shaping the wire response, and emitting analytics. It is the single place where "what a wishlist operation may or may not do" is decided.

## Key elements

- **`WishlistView`** — response interface: `{ items: [{ productId: string }] }`. Ids only; the client renders from its own product store.
- **`toWishlistView(doc)`** — maps a `WishlistDocument | null` into `WishlistView`; treats `null` and empty as equivalent.
- **`wishlistGet(userId)`** — returns the view; never 404.
- **`wishlistAdd(userId, productId, context)`** — verifies the product exists **and** is public via `productRepository.findPublicById`; idempotent add (`$addToSet`); emits `WISHLIST_ITEM_ADDED`.
- **`wishlistRemove(userId, productId, context)`** — removes one line; 404 if the line is absent; emits `WISHLIST_ITEM_REMOVED`.
- **`wishlistMoveToCart(userId, productId, context)`** — confirms the line exists, asks `cartService.cartItemAddById` first, then removes the line. If the cart write fails the line is **kept** (retryable); the reverse order would risk dropping the line unrecoverably. Emits `WISHLIST_MOVED_TO_CART`.
- **`wishlistDeleteByUserId(userId)`** — exported for the hard-delete user subscription (see `module.ts`).
- **`productRemoveFromWishlistsById(productId)`** — exported for the product-deletion subscription (see `module.ts`).
- **`wishlistService`** — the public object bundling all of the above; this is what controllers import.

## Relationships

- **`src/modules/wishlist/controllers/*`** (`get-wishlist`, `post-wishlist`, `delete-wishlist-item`, `post-move-to-cart`) — each controller delegates to exactly one method on `wishlistService`.
- **`src/modules/cart/index.ts` / `src/modules/cart/services/index.ts`** — `wishlistMoveToCart` calls `cartService.cartItemAddById`; the cart is the authority on whether a product may be carted.
- **`src/modules/products/index.ts` / `src/modules/products/repository.ts`** — `wishlistAdd` calls `productRepository.findPublicById` to gate on visibility.
- **`src/infrastructure/http/response.ts`** — every write path returns `ResponseSuccess` or `ResponseReject` built with `generateSuccess` / `generateReject`.
- **`src/infrastructure/http/request.ts`** — `CallerContext` type flows through as the `context` parameter for analytics base-building.
- **`src/infrastructure/i18n/index.ts`** — `t()` supplies user-facing message strings (e.g. `wishlist.added`, `wishlist.not-found`).
- **`src/infrastructure/observability/analytics/index.ts`** — `emitAnalyticsEvent` + `buildAnalyticsBase` called after each successful write.
- **`src/modules/wishlist/analytics.ts`** — `wishlistAnalyticsEvents` enum providing the event-name constants.
- **`src/modules/wishlist/model.ts`** — `WishlistDocument` type used by `toWishlistView` and repository calls.

## Notes

- **Response shape is ids-only by design.** Shipping full product objects would over-serialize and break the contract suite. `productId` is stored as a Mongo ObjectId but returned as a `String`.
- **GET never 404s.** A missing wishlist and an empty wishlist are the same state: `{ items: [] }`.
- **Move-to-cart ordering is deliberate and asymmetric.** Cart write precedes wishlist removal. A cart failure leaves the line intact (recoverable); the inverse could lose the line and then fail to restore it.
- **`wishlistMoveToCart` does not re-check product visibility.** That rule belongs to the cart; re-deriving it here would be a second copy of the same invariant.
- **`wishlistDeleteByUserId` / `productRemoveFromWishlistsById`** are not called by any controller. They are consumed by event subscriptions wired up in the wishlist `module.ts`.
