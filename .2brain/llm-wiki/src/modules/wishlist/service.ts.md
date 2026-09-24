---
source: src/modules/wishlist/service.ts
sha256: c0417cc439074cf21022cb5a6b7a9235a4c31b6936358accaa66c67da99adb7f
generated_at: 2026-09-23T19:48:31.434346+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/service.ts

## Purpose

Business-logic layer for all wishlist operations. It translates repository reads/writes into the OpenAPI-declared `WishlistResponse` shape (`{ items: [{ productId }] }`), enforces cross-module rules (product visibility, cart capacity), and emits analytics events. Controllers never call the repository directly; they go through the `wishlistService` barrel export defined here.

## Key elements

- **`WishlistView`** — the response contract: `{ items: WishlistItem[] }`, where each item carries only `productId` (a string). The client renders product details from its own store.
- **`toWishlistView`** (private) — maps a `WishlistDocument | null` to `WishlistView`, coercing `productId` to `String`.
- **`wishlistGet(userId)`** — returns the user's wishlist; absence and empty are the same state (empty view, never 404).
- **`wishlistAdd(userId, productId, context)`** — validates the product exists and is publicly visible via `productService.findPublicById`, then idempotently inserts the line (`$addToSet`). Emits `WISHLIST_ITEM_ADDED`.
- **`wishlistRemove(userId, productId, context)`** — removes a line; returns 404 if the line is absent (stale-view signal). Emits `WISHLIST_ITEM_REMOVED`.
- **`wishlistMoveToCart(userId, productId, context)`** — the "exit" operation. Verifies the line is saved, delegates to `cartService.cartItemAddById`, then removes the line. Emits `WISHLIST_MOVED_TO_CART`.
- **`wishlistDeleteByUserId(userId)`** — bulk cleanup for hard user deletion (called via `module.ts` subscription).
- **`productRemoveFromWishlistsById(productId)`** — bulk cleanup for product hard-deletion (called via `module.ts` subscription).
- **`wishlistService`** — the object literal that groups the six functions above; this is the sole export controllers use.

## Relationships

- **`src/modules/products/service.ts`** — `wishlistAdd` calls `productService.findPublicById` to gate saves on public visibility; `wishlistMoveToCart` indirectly depends on the same rule through the cart.
- **`src/modules/cart/services/index.ts`** — `wishlistMoveToCart` calls `cartService.cartItemAddById` and interprets its `ResponseSuccess | ResponseReject` envelope, specifically checking for `CART_QUANTITY_LIMIT`.
- **`src/infrastructure/http/response.ts`** — all mutating operations return `ResponseSuccess<WishlistView>` or `ResponseReject` via `generateSuccess` / `generateReject`.
- **`src/infrastructure/i18n/index.ts` / `context.ts`** — `t()` supplies user-facing error and success messages (`wishlist.product-not-found`, `wishlist.added`, etc.).
- **`src/infrastructure/observability/analytics/index.ts`** — `emitAnalyticsEvent` + `buildAnalyticsBase` fire on add, remove, and move-to-cart.
- **`src/modules/wishlist/analytics.ts`** — provides the event-name constants (`WISHLIST_ITEM_ADDED`, `WISHLIST_ITEM_REMOVED`, `WISHLIST_MOVED_TO_CART`).
- **`src/modules/wishlist/model.ts`** — imports the `WishlistDocument` type used by `toWishlistView` and repository calls.
- **`src/modules/wishlist/index.ts`** — re-exports `wishlistService` to the rest of the app.
- **`src/modules/wishlist/controllers/*`** — each controller (`get-wishlist`, `post-wishlist`, `delete-wishlist-item`, `post-move-to-cart`) calls one named function on `wishlistService`.

## Notes

- **Response is ids only.** The contract suite rejects any response that ships product objects per line. `toWishlistView` is the single serialization point.
- **Idempotent add.** `wishlistRepository.addLine` uses `$addToSet`; a double-click returns the same 200, not a 409.
- **Move-to-cart ordering is deliberate.** Cart write happens _before_ wishlist removal. If the cart write fails, the line remains saved (retryable). The reverse order risks losing the line with no cart entry.
- **404 vs. pass-through in move-to-cart.** A cart rejection that is _not_ `CART_QUANTITY_LIMIT` is re-wrapped as a wishlist 404 (`product-not-found`). The `CART_QUANTITY_LIMIT` reject passes through unchanged so the shopper sees the cart's own message.
- **`wishlistGet` never 404s.** Absence and emptiness are indistinguishable to the caller; the view is simply `{ items: [] }`.
- **The two bulk-removal exports** (`wishlistDeleteByUserId`, `productRemoveFromWishlistsById`) are not exposed to controllers; they exist for `module.ts` event subscriptions only.
