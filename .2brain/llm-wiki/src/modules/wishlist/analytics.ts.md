---
source: src/modules/wishlist/analytics.ts
sha256: 29f1d9feda25a71d4e582e05d9af716a4fa90c8e6f5fa79baed38b7c14a497ae
generated_at: 2026-11-08T09:11:40.358810+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/analytics.ts

## Purpose

Defines the wishlist module's analytics event names and registers them into the shared analytics port's type map. This exists so event names are single-sourced, type-safe, and follow the project-wide naming convention, while the wishlist save funnel (add/remove) is clearly linked to the purchase funnel via the `WISHLIST_MOVED_TO_CART` exit event.

## Key elements

- **`wishlistAnalyticsEvents`** — `as const` object mapping intent to snake-case event name strings. Three keys:
  - `WISHLIST_ITEM_ADDED` → `'wishlist_item_added'`
  - `WISHLIST_ITEM_REMOVED` → `'wishlist_item_removed'`
  - `WISHLIST_MOVED_TO_CART` → `'wishlist_moved_to_cart'` (the funnel-exit event)
- **Module augmentation** (`declare module '@infrastructure/observability/analytics'`) — adds a `wishlist` property to the global `AnalyticsEventMap` interface, constrained to the union of values in `wishlistAnalyticsEvents`.

## Relationships

- **`src/modules/wishlist/service.ts`** — Consumer of these event names; the service emits them through the analytics port at the corresponding wishlist actions.
- **`src/modules/wishlist/tests/unit/analytics.test.ts`** — Unit-tests the exported event names and the shape of the module augmentation.
- **`src/modules/wishlist/tests/integration/service.test.ts`** — Integration tests that verify the service emits the expected event names from this file.

## Notes

- Event names must follow the convention documented at `docs/tools/analytics.md#naming` (snake-case, module-prefixed).
- The module-augmentation pattern mirrors `cart/audit.ts`; if you add a new wishlist event, you only edit `wishlistAnalyticsEvents` — the type union updates automatically via the `typeof … [keyof typeof …]` reference.
- `WISHLIST_MOVED_TO_CART` is deliberately the *only* event that bridges into the purchase funnel; treat it as the canonical hand-off point in any funnel analysis.
