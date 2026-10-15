---
source: src/modules/wishlist/service.ts
sha256: 305e88eca4121cfd714a6e780895d3c57ea08d5b30a6c94ac9b11ae49e759c20
generated_at: 2026-10-15T12:27:46.506101+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/service.ts

## Purpose

The service layer for the wishlist module. It orchestrates all wishlist operations (get, add, remove, move-to-cart, export, deletion) by composing repository access with product visibility checks, cart availability lookups, analytics emission, and domain events. Controllers call exclusively through the `wishlistService` barrel object; they never import the bare functions.

## Key elements

- **`present`** (internal) — Fetches live product availability via `cartService.productAvailabilityFor` and renders the `WishlistView` (`{ items: [{ productId, availability }] }`).
- **`wishlistGet`** — Returns the view for a user; absence and emptiness are the same state (empty array, never 404).
- **`wishlistExportLines`** — Returns only stored `{ productId }` pairs (no availability) for the personal-data export.
- **`wishlistAdd`** — Verifies the product exists **and** is publicly visible, then inserts via `$addToSet` (idempotent). Emits `WISHLIST_ITEM_ADDED` analytics only when the line was genuinely new.
- **`wishlistRemove`** — Deletes a line; returns 404 if the line is absent (signals stale client view). Emits `WISHLIST_ITEM_REMOVED` analytics.
- **`wishlistMoveToCart`** — Adds the product to the cart first, then removes the wishlist line. Passes through the cart's `CART_QUANTITY_LIMIT` (422) as-is; maps other cart failures to a wishlist 404. Emits `WISHLIST_MOVED_TO_CART` analytics.
- **`wishlistDeleteByUserId`** — Hard-deletes all wishlist lines within the caller's Mongoose session (used by `personalData.erase`).
- **`productRemoveFromWishlistsById`** — Removes a product from every wishlist; emits a `WISHLIST_ITEMS_REMOVED` domain event carrying affected `userIds` and product titles (for notifications). No event when zero lists were affected.
- **`wishlistService`** — The exported barrel object bundling all the above.

## Relationships

- **`@infrastructure/http/response`** — Imports `generateSuccess` / `generateReject` and their types to shape every return value.
- **`@infrastructure/i18n`** — Imports `t` for localized status/error messages.
- **`@infrastructure/observability/analytics`** — Imports `emitAnalyticsEvent` / `buildAnalyticsBase` to fire tracking events on add, remove, and move.
- **`@kernel/events`** — Imports `emitDomainEvent` to publish `WISHLIST_ITEMS_REMOVED` after a product deletion affects saved lines.
- **`@modules/products`** — Calls `productService.findPublicById` before allowing an add.
- **`@modules/cart`** — Calls `cartService.productAvailabilityFor` (for the view) and `cartService.cartItemAddById` (for move-to-cart).
- **`./analytics`** — Imports the `wishlistAnalyticsEvents` enum.
- **`./presenter`** — Imports `presentWishlist`, `savedProductIds`, and the `WishlistView` type.
- **Controllers (`get-wishlist`, `delete-wishlist-item`, `post-move-to-cart`)** — Call `wishlistService.wishlistGet`, `.wishlistRemove`, and `.wishlistMoveToCart` respectively.
- **`src/modules/notifications/tests/integration/events.test.ts`** — Integration-tests the `WISHLIST_ITEMS_REMOVED` domain event this service emits.
- **`src/modules/delivery/tests/unit/fulfillment.test.ts`** — Unit-tests cart availability interactions that this service depends on via `cartService`.

## Notes

- **Move-to-cart ordering is deliberate.** Cart add → wishlist remove. If the cart write fails the wishlist line survives (retryable); the reverse order risks an unrecoverable loss.
- **Cart quantity-limit passthrough.** A `CART_QUANTITY_LIMIT` error (per-line ceiling `NODE_CART_LINE_MAX`) is forwarded verbatim to the client; all other cart failures are remapped to a wishlist 404 so the shopper sees "product unavailable" rather than a cart-specific code.
- **Idempotent add, non-idempotent remove.** `wishlistAdd` uses `$addToSet` (double-click = same 200, no duplicate analytics). `wishlistRemove` on an absent line is a 404, not a silent 200.
- **View contract is intentionally thin.** Only `productId` + `availability` per line; the client renders product details from its own store. Shipping full product documents would break the contract suite.
- **Export omits availability.** Availability is the shop's live opinion, not user-saved data; the export returns raw IDs only.
- **`productRemoveFromWishlistsById` is a subscription hook** wired in `module.ts`, not called by a controller. It carries product titles (by locale) into the domain event so downstream notification modules can render them.
