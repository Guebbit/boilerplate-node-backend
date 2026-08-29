# src/modules/wishlist/tests/unit/analytics.test.ts

## Purpose

Unit test that pins the exact string values emitted by the wishlist analytics module. It exists because external dashboards (Umami) key their series on these literal strings — renaming a constant freely is safe, but silently changing its value would silently break a dashboard with no in-repo error. The test also confirms the module augmentation registers wishlist events into the app-wide `AnalyticsEventMap`.

## Key elements

- **`describe('the wishlist analytics vocabulary')`** — the suite; no mocks, no database, pure static-assertion.
- **`it('spells every event exactly as the dashboards expect')`** — asserts `wishlistAnalyticsEvents` deep-equals `{ WISHLIST_ITEM_ADDED: 'wishlist_item_added', WISHLIST_ITEM_REMOVED: 'wishlist_item_removed', WISHLIST_MOVED_TO_CART: 'wishlist_moved_to_cart' }`.
- **`it('registers its events in the app-wide union')`** — type-level check: assigns `wishlistAnalyticsEvents.WISHLIST_MOVED_TO_CART` to a variable typed `AnalyticsEventMap['wishlist']`, proving the `declare module` augmentation in `analytics.ts` is in effect. Fails at compile time, not runtime.

## Relationships

- **`src/modules/wishlist/analytics.ts`** — source of `wishlistAnalyticsEvents` (the constants under test) and the `declare module` augmentation that contributes `'wishlist'` to `AnalyticsEventMap`.
- **`src/infrastructure/observability/analytics/index.ts`** — exports the `AnalyticsEventMap` type; the second test exercises this type to verify wishlist events are a member of its `'wishlist'` key.

## Notes

- Mirrors the convention in `orders/tests/unit/audit.test.ts`: pin the **string**, not the constant name. The name can be refactored freely; the value is a contract with external dashboards (see `docs/tools/analytics.md#renaming-is-not-free`).
- The second test is a **compile-time** assertion. If the `declare module` augmentation is removed from `analytics.ts`, this test file still compiles in isolation — but `emitAnalyticsEvent` call sites elsewhere break. The test makes that breakage local and visible here.
- `service.test.ts` (which exercises actual event emission) lives in `tests/integration/` because it requires a real document. This file stays in `unit/` because it only validates a static object and a type relationship.
