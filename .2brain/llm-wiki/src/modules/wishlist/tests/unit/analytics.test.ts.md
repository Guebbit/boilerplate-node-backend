---
source: src/modules/wishlist/tests/unit/analytics.test.ts
sha256: 8caaad22fd2aedfc8b184c004e4d4315a3ebbacc6ac2649c10acbc8883bc5300
generated_at: 2026-11-08T09:15:23.482975+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/tests/unit/analytics.test.ts

## Purpose

Pins the exact string values emitted by the wishlist analytics constants so that a silent rename (or accidental refactor of the string literal) is caught immediately. Umami dashboards key their series on these strings, so a mismatch silently drops data. The test also asserts that the `declare module` augmentation in `analytics.ts` actually registers the events in the app-wide `AnalyticsEventMap` union.

## Key elements

- **`describe('the wishlist analytics vocabulary')`** – sole test suite; no nested groups.
- **`it('spells every event exactly as the dashboards expect')`** – deep-equals `wishlistAnalyticsEvents` against the literal map `{ WISHLIST_ITEM_ADDED: 'wishlist_item_added', WISHLIST_ITEM_REMOVED: 'wishlist_item_removed', WISHLIST_MOVED_TO_CART: 'wishlist_moved_to_cart' }`.
- **`it('registers its events in the app-wide union')`** – assigns `wishlistAnalyticsEvents.WISHLIST_MOVED_TO_CART` to a variable typed as `AnalyticsEventMap['wishlist']`; the real assertion is the compile-time type check, the runtime `toBe` is incidental.

## Relationships

- **`src/modules/wishlist/analytics.ts`** – source of the `wishlistAnalyticsEvents` constant and the `declare module` augmentation that adds `'wishlist'` to `AnalyticsEventMap`. This test is the safety net for both.
- **`src/infrastructure/observability/analytics/index.ts`** – exports the `AnalyticsEventMap` type that the second test exercises. Without the augmentation, `AnalyticsEventMap['wishlist']` would not exist and the call sites using `emitAnalyticsEvent` would fail type-checking instead of here.

## Notes

- The file's header doc-block explicitly calls out that **constant names are refactored freely; the string literals are not**. See `docs/tools/analytics.md#renaming-is-not-free`.
- No mocks, no database, no async setup — the target is a static object literal.
- The second test is a *type-level* guard: if someone removes the `declare module` augmentation from `analytics.ts`, this file still compiles in isolation, but `tsc` at the project level will flag the missing key. It mirrors the pattern used in the orders audit test for its union.
