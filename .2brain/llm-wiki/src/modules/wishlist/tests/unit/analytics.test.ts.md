---
source: src/modules/wishlist/tests/unit/analytics.test.ts
sha256: 8caaad22fd2aedfc8b184c004e4d4315a3ebbacc6ac2649c10acbc8883bc5300
generated_at: 2026-09-23T19:49:10.724349+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/tests/unit/analytics.test.ts

## Purpose

Guarantees that the wishlist module's analytics event strings are frozen to the exact values Umami dashboards key on, and that those events are properly registered in the app-wide `AnalyticsEventMap` union. It exists to make a silent string rename (or a dropped module augmentation) a compile/test failure rather than a dashboard gap that goes unnoticed.

## Key elements

- **`describe('the wishlist analytics vocabulary')`** — the single suite; no setup/teardown needed (static map, no DB, no mocks).
- **`it('spells every event exactly as the dashboards expect')`** — asserts the full `wishlistAnalyticsEvents` object equals `{ WISHLIST_ITEM_ADDED: 'wishlist_item_added', WISHLIST_ITEM_REMOVED: 'wishlist_item_removed', WISHLIST_MOVED_TO_CART: 'wishlist_moved_to_cart' }` via `toEqual`. Catches accidental string edits.
- **`it('registers its events in the app-wide union')`** — assigns `wishlistAnalyticsEvents.WISHLIST_MOVED_TO_CART` to a variable typed as `AnalyticsEventMap['wishlist']`. Acts as a type-level check that the `declare module` augmentation in `analytics.ts` is still in place; if it's removed, the assignment becomes a type error at test time.

## Relationships

- **`src/modules/wishlist/analytics.ts`** — imports `wishlistAnalyticsEvents`, the constant map under test. Also the home of the `declare module` augmentation that wires these keys into `AnalyticsEventMap`.
- **`src/infrastructure/observability/analytics/index.ts`** — imports the `AnalyticsEventMap` type used by the second test to confirm wishlist's events are part of the app-wide union.

## Notes

- The constant **names** (e.g. `WISHLIST_ITEM_ADDED`) are free to rename; the **string values** are contractual with Umami. Renaming a value without updating dashboards silently drops a series (see `docs/tools/analytics.md#renaming-is-not-free`).
- The second test is primarily a **type-check** assertion. The runtime `expect(event).toBe(...)` is trivially true; the value is that the `const event: AnalyticsEventMap['wishlist']` annotation fails compilation if the augmentation is missing. Same pattern as the orders audit test.
- No mocking or database fixtures are needed or used — the target under test is a plain object literal.
