# src/modules/wishlist/analytics.ts

## Purpose

Declares the analytics event names emitted by the wishlist module (a "save funnel" with a single exit point into the purchase funnel) and registers them into the app-wide `AnalyticsEventMap` so that emit sites get autocomplete and type safety. It contains no runtime logic—only a const map and a `declare module` augmentation.

## Key elements

- **`wishlistAnalyticsEvents`** – `as const` object with three keys/values:
  - `WISHLIST_ITEM_ADDED` → `'wishlist_item_added'`
  - `WISHLIST_ITEM_REMOVED` → `'wishlist_item_removed'`
  - `WISHLIST_MOVED_TO_CART` → `'wishlist_moved_to_cart'` — the single event that bridges the save funnel to the purchase funnel.
- **`declare module '@infrastructure/observability/analytics'`** – Augments the `AnalyticsEventMap` interface with a `wishlist` key whose type is the union of the three string literals above, giving callers compile-time checking on event names.

## Relationships

- **`src/modules/wishlist/service.ts`** – Consumes the exported event names (via the augmented `AnalyticsEventMap`) when firing wishlist analytics events through the analytics port.
- **`src/modules/wishlist/tests/unit/analytics.test.ts`** – Unit-tests this module's declarations (event name values and/or the augmentation contract).

## Notes

- This file is **type-only at runtime**: it exports a plain const and a `declare module` block. Importing it for side-effects has no runtime effect beyond the const binding.
- Event naming follows the convention in `docs/tools/analytics.md#naming` (snake_case, `module_action` pattern).
- The same augmentation pattern is used by `./audit.ts`; keep new wishlist events in this file rather than scattering them across service code.
