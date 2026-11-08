---
source: src/modules/wishlist/events.ts
sha256: 7974b7cd1de64da9694cdd66fd28376ae14c500d8a0a9d20b9ec14ec3c8153cf
generated_at: 2026-11-08T09:12:24.086946+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/events.ts

## Purpose

Declares the wishlist module's domain events by augmenting the kernel's `DomainEventMap` interface (via TypeScript module augmentation), so the event catalogue grows per-module without editing the kernel. Also exports a shared event-name constant so emitters and listeners reference a single spelling.

## Key elements

- **`declare module '@kernel/events'`** — Adds the `'wishlist.items_removed'` key to `DomainEventMap` with payload `{ userIds: string[]; productId: string; titles: Record<string, string> }`.
- **`WISHLIST_ITEMS_REMOVED`** (exported const) — The string literal `'wishlist.items_removed'`; the canonical event name for emitters and listeners to share.

## Relationships

- **`src/modules/wishlist/service.ts`** — The likely emitter: fires `WISHLIST_ITEMS_REMOVED` after pulling a deleted product from wishlists (per the JSDoc: "Emitted once per product deletion, after the pull").
- **`src/modules/wishlist/index.ts`** — Module barrel; expected to re-export `WISHLIST_ITEMS_REMOVED` for consumers outside the wishlist folder.
- **`src/modules/wishlist/tests/integration/items-removed.test.ts`** — Integration test that asserts this event is emitted (and with the correct payload shape) when a product is removed from wishlists.

## Notes

- The `titles` field is a snapshot copied from the `product.deleted` event; at the time this event fires the product record no longer exists, so listeners can only use `titles` to display a name.
- The event is only emitted when **at least one** wishlist contained the product (i.e. `userIds` is non-empty).
- The module uses `declare module` augmentation rather than a runtime registration call—no import side-effects are needed for the type to be visible; only the constant import is runtime.
