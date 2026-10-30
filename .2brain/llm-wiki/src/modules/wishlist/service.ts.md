---
source: src/modules/wishlist/service.ts
sha256: 1ab6dfa057832532f97e6a09e5c0e4b0061fb80e8234f09ed1fc079b418a4f9a
generated_at: 2026-10-29T06:35:11.305667+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/service.ts

## Purpose

Domain service for the wishlist module. It orchestrates all wishlist operations (view, add, remove, move-to-cart, deletion) by coordinating repository access, product/cart availability lookups, analytics emission, and domain events. Exposes a single `wishlistService` object as the only entry point for controllers and sibling modules.

## Key elements

- **`present`** *(private)* — Fetches live product availability via `cartService.productAvailabilityFor` and shapes the result into a `WishlistView` through `presentWishlist`.
- **`get(userId)`** — Returns the wishlist view. Absence and emptiness are the same state: always an empty view, never 404.
- **`exportLines(userId)`** — Returns raw `{ productId }` pairs only (no availability) for personal-data export.
- **`add(userId, productId, context)`** — Validates the product is public via `productService.findPublicById`, persists with `$addToSet` (idempotent), emits `WISHLIST_ITEM_ADDED` analytics only on a genuine first save, returns 200 + view or 404.
- **`remove(userId, productId, context)`** — Deletes a line; returns 404 if the line is absent (signals stale client view). Emits `WISHLIST_ITEM_REMOVED` analytics.
- **`moveToCart(userId, productId, context)`** — Validates the line exists, calls `cartService.addItemById` **first**, then removes the wishlist line. A non-cart-limit failure is mapped to 404; a `CART_QUANTITY_LIMIT` error is passed through to the caller. Emits `WISHLIST_MOVED_TO_CART` analytics.
- **`removeByUserId(userId, session)`** — Hard-deletion hook; joins the caller's Mongoose transaction.
- **`removeByProductId(productId, titles)`** — Product-deletion subscription handler; removes the product from all wishlists and emits a `WISHLIST_ITEMS_REMOVED` domain event (only if at least one user was affected).
- **`wishlistService`** *(export)* — The single public object bundling all seven functions.

## Relationships

- **`@infrastructure/http/response`** — Imports `generateSuccess`, `generateReject`, and the `ResponseSuccess`/`ResponseReject` types used by every public method.
- **`@infrastructure/i18n`** — Imports `t` for localized error messages in reject envelopes.
- **`@infrastructure/observability/analytics`** — Imports `emitAnalyticsEvent` and `buildAnalyticsBase`; every mutating operation fires a wishlist-specific analytics event.
- **`@kernel/events`** — Imports `emitDomainEvent` to announce `WISHLIST_ITEMS_REMOVED` after a product deletion.
- **`@modules/products`** — Calls `productService.findPublicById` to gate `add` on product existence and public visibility.
- **`@modules/cart`** — Calls `cartService.productAvailabilityFor` (shared availability source) and `cartService.addItemById` (move-to-cart). The cart's availability rule is the single source of truth; this service never re-derives sale status.
- **`./analytics`** — Imports `wishlistAnalyticsEvents` constants for event names.
- **`./events`** — Imports `WISHLIST_ITEMS_REMOVED` domain-event name.
- **`./repository`** — Imports `wishlistRepository` for all persistence reads/writes.
- **`./presenter`** — Imports `presentWishlist`, `savedProductIds`, and the `WishlistView` type.
- **Controllers** (`get-wishlist.ts`, `delete-wishlist-item.ts`) — Call through `wishlistService.get` / `.remove`; never import the private functions directly.
- **Tests** (cart integration `product-restored-meanwhile`, delivery unit `fulfillment`, notifications integration `events`) — Exercise the cross-module contracts this service depends on (cart availability, product deletion events).

## Notes

- **404 vs. empty is asymmetric.** `get` never 404s (empty view), but `remove` and `moveToCart` do 404 when the specific line is absent. This is intentional: a read of "my wishlist" has no line to miss, but a write targets a line the client believes exists.
- **`moveToCart` ordering is load-bearing.** Cart write precedes wishlist removal so a failure leaves the line intact (retryable). The reverse order could lose the line and then fail the cart add — unrecoverable for the shopper.
- **`add` analytics fire only when `added` is true.** The repository's `addLine` returns an `added` flag; a duplicate save (double-click) returns 200 but suppresses the `WISHLIST_ITEM_ADDED` event.
- **`exportLines` omits availability by design.** Availability is the shop's live opinion of a product, not data the user saved; the personal-data export must reflect only what the user chose.
- **Product-deletion is subscription-driven.** `removeByProductId` is called by a `PRODUCT_DELETED` event subscription (see `module.ts`), not by the controller layer. It covers both soft and hard deletes.
