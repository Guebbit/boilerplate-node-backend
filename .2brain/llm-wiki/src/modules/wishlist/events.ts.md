---
source: src/modules/wishlist/events.ts
sha256: 7974b7cd1de64da9694cdd66fd28376ae14c500d8a0a9d20b9ec14ec3c8153cf
generated_at: 2026-10-15T12:26:09.772400+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/events.ts

## Purpose
Declares the wishlist module's domain-event payloads by augmenting the kernel's `DomainEventMap` interface, so the app-wide event catalogue grows incrementally per module. Exports the single event-name constant used by emitters and listeners.

## Key elements
- **`declare module '@kernel/events'`** — Augments the `DomainEventMap` interface with the `'wishlist.items_removed'` entry, defining its payload as `{ userIds: string[]; productId: string; titles: Record<string, string> }`. No runtime code is produced by this block.
- **`WISHLIST_ITEMS_REMOVED`** (exported constant) — The string literal `'wishlist.items_removed'`, provided so the emitter and its listeners reference one shared spelling.

## Relationships
- **`src/modules/wishlist/index.ts`** — Re-exports the module's public API, including `WISHLIST_ITEMS_REMOVED`, to consumers outside the module folder.
- **`src/modules/wishlist/service.ts`** — The emitter: fires `WISHLIST_ITEMS_REMOVED` (after pulling a deleted product from wishlists) and relies on the payload shape declared here.
- **`src/modules/wishlist/tests/integration/items-removed.test.ts`** — Integration test that exercises the emit path; depends on the event name constant and the payload contract defined in this file.

## Notes
- The `titles` field is a locale-keyed snapshot of the product name copied from the upstream `product.deleted` event because, at the moment `wishlist.items_removed` fires, the product record no longer exists and listeners cannot look it up.
- The event is emitted **once per product deletion** and **only when at least one wishlist held the product** (per the doc comment on the payload interface).
- The file produces no runtime logic beyond the one `export const`; all "behavior" is the TypeScript type augmentation, which exists only at compile time.
