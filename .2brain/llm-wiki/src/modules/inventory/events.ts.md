---
source: src/modules/inventory/events.ts
sha256: cf1fdb17c3de6b48c9ba25139a2a9666e706f98a0dbff6a844a42ce3c7d43b20
generated_at: 2026-09-23T18:44:32.525124+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/events.ts

## Purpose

Declares the single domain event emitted by the inventory module (`inventory.reservation_expired`) by augmenting the kernel's `DomainEventMap` interface. It exists to let the `orders` module react to a hold expiring without creating a circular import back into inventory.

## Key elements

- **`declare module '@kernel/events'`** — Extends `DomainEventMap` with the key `'inventory.reservation_expired'` and its payload shape `{ orderId: string }`. This is the sole event for this module; stock-level changes are deliberately *not* events here (they live in `products/events.ts`).
- **`RESERVATION_EXPIRED`** (exported `const`) — The canonical string `'inventory.reservation_expired'`, re-exported through the barrel so emitters and listeners share one spelling instead of duplicating a literal.

## Relationships

- **`src/modules/inventory/index.ts`** — Barrel file that re-exports `RESERVATION_EXPIRED`, making the event name available to importers without reaching into this file directly.
- **`src/modules/inventory/service.ts`** — The emitter side: after releasing held units it fires `RESERVATION_EXPIRED` with the affected `orderId`.
- **`src/modules/inventory/module.ts`** — Module registration; ties the event declaration into the module's lifecycle so the kernel's catalogue picks it up.
- The **`orders`** module (external neighbor, not listed) is the listener that cancels the corresponding order upon receiving this event. The event exists specifically because `orders` already imports inventory, so a direct import back would form a cycle.

## Notes

- The event name uses past tense (`reservation_expired`) intentionally: by the time `orders` handles it, units are already released. The listener acts on a completed fact, not a pending plan.
- Do **not** add stock-mutation events here. The doc comment explicitly states that a counter write and its explanatory row are a single write and belong in `products/events.ts`.
- The event is declared via TypeScript module augmentation, not a separate registry file — the kernel's `DomainEventMap` is the single source of truth for all module events.
