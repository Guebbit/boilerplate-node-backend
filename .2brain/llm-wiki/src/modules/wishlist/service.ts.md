---
source: src/modules/wishlist/service.ts
sha256: 4afc3366ecef43241cdb0f6e724053a02375e0a041b182767484f8a8a7eb302b
generated_at: 2026-11-14T22:54:21.967122+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/service.ts

## Purpose

Service layer for all wishlist operations. It owns the business rules (validity checks, idempotency, ordering guarantees, limit enforcement) and orchestrates calls to the repository, cart service, product service, analytics, and domain events. Controllers and sibling modules interact exclusively through the single exported `wishlistService` object.

## Key elements

- **`present`** (private) — Enriches a `WishlistDocument` with live product availability by asking `cartService.productAvailabilityFor`, then delegates to `presentWishlist`. Guarantees wishlist and cart never disagree about a product's state.
- **`get`** — Fetches a user's wishlist as a `WishlistView`. Absence and emptiness are the same state (empty view, never 404).
- **`exportLines`** — Returns only `{ productId }[]` with no availability, for personal-data export.
- **`add`** — Validates the product exists and is publicly visible, inserts the line (idempotent via `$addToSet`), enforces `WISHLIST_LIMIT_REACHED` (409), and fires `WISHLIST_ITEM_ADDED` analytics only on a true add.
- **`remove`** — Deletes a saved line; returns 404 if the line is absent. Fires `WISHLIST_ITEM_REMOVED` analytics.
- **`moveToCart`** — The wishlist's exit path. Checks the line exists (404), delegates cart-add to `cartService`, and only on success removes the wishlist line. Passes through cart-specific errors (422 quantity limit, 409 cart full) instead of converting them to 404.
- **`removeByUserId`** — Hard-delete cleanup hook; joins the caller's Mongoose session transaction.
- **`removeByProductId`** — Product-deletion cleanup; removes the product from all wishlists and emits a `WISHLIST_ITEMS_REMOVED` domain event (with localized titles) only if at least one user was affected.
- **`wishlistService`** — The single exported object; the module's one door.

## Relationships

- **`src/infrastructure/http/response.ts`** — Uses `generateSuccess` / `generateReject` and the `ResponseSuccess` / `ResponseReject` types for all HTTP envelope construction.
- **`src/infrastructure/i18n/index.ts`** — Imports `t` for localized error messages in every reject response.
- **`src/infrastructure/i18n/context.ts`** — Provides the i18n context consumed by the `t` calls above.
- **`src/infrastructure/observability/analytics/index.ts`** — Calls `emitAnalyticsEvent` and `buildAnalyticsBase` in `add`, `remove`, and `moveToCart`.
- **`src/kernel/events.ts`** — Calls `emitDomainEvent(WISHLIST_ITEMS_REMOVED, …)` from `removeByProductId`.
- **`src/modules/cart/index.ts`** — Imports `cartService` from here; the wishlist delegates availability queries and cart-add operations to this service.
- **`src/modules/cart/services/index.ts`** — The underlying cart service implementation that `cartService` resolves to, providing availability lookups and item-add.
- **`src/modules/products/index.ts`** — Imports `productService` from here; the wishlist uses it to validate that a product is public before allowing a save.
- **`src/modules/products/services/index.ts`** — The underlying product service implementation that `productService` resolves to, providing the public-visibility lookup.
- **`src/modules/wishlist/analytics.ts`** — Imports `wishlistAnalyticsEvents` for the three analytics event names.
- **`src/modules/wishlist/controllers/get-wishlist.ts`** / **`src/modules/wishlist/controllers/delete-wishlist-item.ts`** — Consumers that call through `wishlistService`.

## Notes

- **One-door convention:** Controllers and siblings must call `wishlistService`, never the bare function bindings. This is stated explicitly in the file's comment.
- **Availability is never stored.** It is always re-derived from `cartService` at read time, so a soft-deleted or off-sale product simply shows as unavailable in the wishlist view without the line being removed.
- **`moveToCart` ordering is deliberate:** cart-add happens *before* wishlist-remove. A failed cart write leaves the line intact (retryable); the reverse order could lose the line irrecoverably.
- **`add` idempotency:** A repeated save of the same product returns 200 with the same view but fires *no* second analytics event (guarded by the `added` flag from the repository).
- **`removeByProductId` event guard:** The `WISHLIST_ITEMS_REMOVED` domain event is emitted only when `userIds.length > 0`; a product no one had saved produces no event.
