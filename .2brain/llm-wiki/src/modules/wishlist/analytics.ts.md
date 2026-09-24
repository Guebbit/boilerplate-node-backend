---
source: src/modules/wishlist/analytics.ts
sha256: 29f1d9feda25a71d4e582e05d9af716a4fa90c8e6f5fa79baed38b7c14a497ae
generated_at: 2026-09-23T19:46:19.618915+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/analytics.ts

## Purpose

Defines the wishlist module's analytics event names and registers them into the app-wide `AnalyticsEventMap` via TypeScript module augmentation. This gives the wishlist a type-safe set of funnel events (save → exit-to-purchase) without the consuming code needing to know the literal strings.

## Key elements

- **`wishlistAnalyticsEvents`** (`as const` object) — the three event names this module emits:
  - `WISHLIST_ITEM_ADDED` — an item was saved to the wishlist.
  - `WISHLIST_ITEM_REMOVED` — an item was removed from the wishlist.
  - `WISHLIST_MOVED_TO_CART` — the "exit" event linking the save funnel to the purchase funnel.
- **`declare module '@infrastructure/observability/analytics'`** — augments the shared `AnalyticsEventMap` interface with a `wishlist` key typed to the union of the above values, so downstream analytics code gets autocomplete and type safety.

## Relationships

- **`src/modules/wishlist/service.ts`** — the service that fires these events at runtime; it imports `wishlistAnalyticsEvents` as the single source of truth for event names.
- **`src/modules/wishlist/tests/unit/analytics.test.ts`** — unit tests that verify the exported event-name constants.

## Notes

- Naming convention for event strings is governed by `docs/tools/analytics.md#naming` (snake_case, past participle / verb phrase).
- The module-augmentation pattern mirrors `cart/audit.ts`; if you add a new wishlist event, add it to the object **and** it automatically flows into the `AnalyticsEventMap` union — no separate registration step needed.
- `as const` is load-bearing: the `typeof … [keyof typeof …]` indexed type in the augmentation relies on literal types rather than `string`.
