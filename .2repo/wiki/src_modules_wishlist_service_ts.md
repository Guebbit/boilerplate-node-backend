# src/modules/wishlist/service.ts

## Purpose

Business-logic layer for the wishlist domain. It resolves each endpoint's intent (get, add, remove, move-to-cart, cascade-delete) into a single response shape — `{ items: [{ productId }] }` — by orchestrating the wishlist repository, product lookups, and the cart service. Controllers import only the `wishlistService` barrel; the bare functions are module-private.

## Key elements

- **`WishlistView`** — interface matching the OpenAPI `WishlistResponse`; the only shape every endpoint returns.
- **`toWishlistView(doc | null)`** — maps a `WishlistDocument` (or `null`) to the view; normalises `productId` to `string`.
- **`wishlistGet(userId)`** — returns the view; absence is treated as empty, never 404.
- **`wishlistAdd(userId, productId, context)`** — validates the product exists *and* is public via `productRepository.findPublicById`; idempotent upsert (`$addToSet`); emits `WISHLIST_ITEM_ADDED`.
- **`wishlistRemove(userId, productId, context)`** — removes a line; returns 404 if the line is absent (stale-view signal); emits `WISHLIST_ITEM_REMOVED`.
- **`wishlistMoveToCart(userId, productId, context)`** — the wishlist's exit path. Order is deliberate: cart add first, wishlist remove second, so a cart failure leaves the line intact (retryable). A cart refusal maps to 404. Emits `WISHLIST_MOVED_TO_CART`.
- **`wishlistDeleteByUserId(userId)`** — cascade helper called from the user-deletion subscription in `module.ts`.
- **`productRemoveFromWishlistsById(productId)`** — cascade helper called from the product-deletion subscription in `module.ts`.
- **`wishlistService`** (exported) — object bundling all six functions; the only public entry point for controllers.

## Relationships

- **`@infrastructure/http/response`** (`generateSuccess`, `generateReject`, `ResponseSuccess`, `ResponseReject`) — every mutating endpoint returns one of these two envelopes.
- **`@infrastructure/http/request`** (`CallerContext`) — passed into mutating endpoints to seed the analytics base.
- **`@infrastructure/i18n`** (`t`) — all user-facing status messages (`wishlist.added`, `wishlist.removed`, `wishlist.moved-to-cart`, etc.) are resolved here.
- **`@infrastructure/observability/analytics`** (`emitAnalyticsEvent`, `buildAnalyticsBase`) — each mutation fires exactly one analytics event with the context-derived base.
- **`@modules/products`** (`productRepository.findPublicById`) — add and move-to-cart gate on product existence + public visibility.
- **`@modules/cart`** (`cartService.cartItemAddById`) — move-to-cart delegates the "is this product buyable" rule to the cart, avoiding a second copy of that invariant.
- **`./repository`** (`wishlistRepository`) — all reads/writes to the wishlist document go through this data-access layer.
- **`./analytics`** (`wishlistAnalyticsEvents`) — named event constants for the three mutation events.
- **`./model`** (`WishlistDocument`) — the document shape the repository returns and `toWishlistView` consumes.
- **Controllers** (`get-wishlist`, `post-wishlist`, `delete-wishlist-item`, `post-move-to-cart`) — each calls exactly one `wishlistService` method; they contain no business logic of their own.

## Notes

- **Response is IDs only.** The client renders product details from its own store. Shipping full product objects would break the contract suite.
- **404 vs. empty.** `wishlistGet` treats "no document" as an empty view (200). `wishlistRemove` and `wishlistMoveToCart` return 404 for a missing line — the distinction signals "your view is stale."
- **Move-to-cart ordering is intentional and documented.** Cart-add → wishlist-remove. Reversing the order risks dropping the line while the cart write fails, an unrecoverable state for the shopper.
- **The line is intentionally preserved when the cart refuses.** A deactivated product can return to the catalogue; the wishlist outlives the catalogue.
- **Controllers never import the bare functions** — they go through `wishlistService`, keeping the module's internal composition swappable.
