# src/modules/wishlist/tests/unit/analytics.test.ts

## Purpose

Pins the exact string values of the wishlist analytics event constants and verifies they are registered in the app-wide `AnalyticsEventMap` type. It exists to prevent silent breakage: the strings are the keys Umami dashboards plot against, so renaming them without updating dashboards drops a series with no compile-time error.

## Key elements

- **`describe('the wishlist analytics vocabulary')`** — the single test suite.
- **`it('spells every event exactly as the dashboards expect')`** — asserts `wishlistAnalyticsEvents` deep-equals the three known strings (`wishlist_item_added`, `wishlist_item_removed`, `wishlist_moved_to_cart`). Guards the *value*, not the key name.
- **`it('registers its events in the app-wide union')`** — assigns a value to a variable typed as `AnalyticsEventMap['wishlist']`. If the `declare module` augmentation in `analytics.ts` is removed, this line fails at type-check time (not runtime), catching a regression that would otherwise surface only at `emitAnalyticsEvent` call sites.

## Relationships

- **`src/modules/wishlist/analytics.ts`** — the module under test. Provides `wishlistAnalyticsEvents` (the static map of constant → string) and the `declare module` augmentation that adds `'wishlist'` to `AnalyticsEventMap`.
- **`src/infrastructure/observability/analytics/index.ts`** — exports the `AnalyticsEventMap` type. The second test reads from this type to confirm the wishlist events are part of the global union.

## Notes

- The test asserts **string values**, not key names. Keys (e.g. `WISHLIST_ITEM_ADDED`) may be refactored freely; the strings may not.
- The second test is a **compile-time** check. It will never fail at runtime if the augmentation is intact; it only surfaces as a type error during `tsc`. Treat it as a type-level guard, not a runtime assertion.
- No mocks, spies, or database setup are used — the target is a plain static object.
- See `docs/tools/analytics.md#renaming-is-not-free` for the operational reason the strings are load-bearing.
