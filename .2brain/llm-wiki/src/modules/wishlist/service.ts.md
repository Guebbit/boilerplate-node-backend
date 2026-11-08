---
source: src/modules/wishlist/service.ts
sha256: 1ab6dfa057832532f97e6a09e5c0e4b0061fb80e8234f09ed1fc079b418a4f9a
generated_at: 2026-11-08T09:14:18.388366+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/service.ts

## Purpose

Business-logic layer for the wishlist module. Translates user intents (save, remove, move-to-cart, data export, deletion hooks) into repository calls, cart coordination, analytics emission, and the module's canonical response envelope (`{ items: [{ productId, availability }] }`). All controllers and cross-module callers go through the single `wishlistService` export; no endpoint or sibling reaches the internal functions directly.

## Key elements

- **`present(wishlist)`** (internal) – resolves live product availability via `cartService.productAvailabilityFor` and hands the result to `presentWishlist` to build the `WishlistView`. Availability is always the cart's opinion, never the wishlist's.
- **`get(userId)`** – loads the user's wishlist and returns an empty view when absent (no 404).
- **`exportLines(userId)`** – returns bare `{ productId }` pairs (no availability) for the personal-data export flow.
- **`add(userId, productId, context)`** – validates the product exists and is public via `productService.findPublicById`, inserts the line idempotently (`$addToSet`), fires `WISHLIST_ITEM_ADDED` analytics only on a genuine add, and returns the updated view.
- **`remove(userId, productId, context)`** – deletes one line; returns 404 if the line is absent. Fires `WISHLIST_ITEM_REMOVED` analytics.
- **`moveToCart(userId, productId, context)`** – checks the line exists, asks `cartService.addItemById` first, then removes the line. Passes through `CART_QUANTITY_LIMIT` (422) as-is; maps any other cart failure to a wishlist 404. Fires `WISHLIST_MOVED_TO_CART` analytics.
- **`removeByUserId(userId, session)`** – hard-deletes all wishlist data for a user, joining the caller's Mongoose transaction.
- **`removeByProductId(productId, titles)`** – strips a product from every user's wishlist (triggered by `PRODUCT_DELETED`); emits `WISHLIST_ITEMS_REMOVED` domain event only when at least one list was affected.
- **`wishlistService`** (export) – the module's single public door bundling all seven functions above.

## Relationships

- **`@infrastructure/http/response`** – every mutating operation returns `ResponseSuccess<WishlistView>` or `ResponseReject` built with `generateSuccess` / `generateReject`.
- **`@infrastructure/i18n`** – `t('wishlist.*')` supplies localized error messages in all reject envelopes.
- **`@infrastructure/observability/analytics`** – `emitAnalyticsEvent` + `buildAnalyticsBase` fire on add, remove, and move-to-cart.
- **`@kernel/events`** – `emitDomainEvent(WISHLIST_ITEMS_REMOVED, …)` broadcasts to downstream subscribers (e.g. shop-tasks notices) after a product deletion purges lists.
- **`@modules/cart`** – `cartService.productAvailabilityFor` supplies the availability data in every view; `cartService.addItemById` is the first write in `moveToCart`. The cart's rules (sale status, per-line max) are the single source of truth; the wishlist never re-derives them.
- **`@modules/products`** – `productService.findPublicById` gates `add` so hidden or soft-deleted products cannot be saved.
- **`./analytics`** – `wishlistAnalyticsEvents` enum keys used in every `emitAnalyticsEvent` call.
- **`./presenter`** – `presentWishlist` and `savedProductIds` shape the document into the wire view.
- **`./repository`** – all persistence (`findByUserId`, `addLine`, `removeLine`, `deleteByUserId`, `removeProductFromAll`).
- **`./model`** – `WishlistDocument` type for the Mongoose shape.
- **`./events`** – `WISHLIST_ITEMS_REMOVED` domain-event name.
- **Controllers (`get-wishlist`, `delete-wishlist-item`)** – call `wishlistService.get` / `.remove`; they never touch the repository or presenter directly.

## Notes

- **View contract is deliberately thin.** Each item carries only `productId` + `availability`; full product data is the client's job (renders from its own store). Shipping richer data would break the contract suite.
- **Idempotent add.** `addLine` uses `$addToSet`; a repeated call returns 200 with the same view but fires no second `WISHLIST_ITEM_ADDED` analytics event.
- **`moveToCart` write order is load-bearing.** Cart write precedes wishlist removal so a cart failure leaves the line intact (retryable). The reverse order could lose the line and then fail to add it — unrecoverable for the shopper.
- **`moveToCart` 404 vs 422.** A cart refusal due to per-line ceiling (`CART_QUANTITY_LIMIT`) is passed through to the client as-is; any other cart failure is mapped to the wishlist's own 404 ("product not found"), because the line must survive a temporary sale-status refusal.
- **`removeByUserId` participates in the caller's transaction** (accepts a `ClientSession`), so it commits or rolls back atomically with the rest of `personalData.erase`.
- **`removeByProductId` emits a domain event only when `userIds.length > 0`**, avoiding a no-op broadcast.
