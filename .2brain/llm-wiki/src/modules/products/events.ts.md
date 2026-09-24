---
source: src/modules/products/events.ts
sha256: 599028fbf6ee43c3399fbea81d6396259fcb98bfa699f5bf9c90395a4d871485
generated_at: 2026-09-23T19:26:34.057014+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/events.ts

## Purpose

Declares the domain events the products module emits and exports their name constants. It augments the kernel's `DomainEventMap` via TypeScript module declaration so the event catalogue grows with each owning module rather than living in a shared enumeration file.

## Key elements

- **`declare module '@kernel/events'` block** — Augments `DomainEventMap` with three payload types:
    - `'product.deleted'` — `{ productId: string; hardDelete: boolean }`. Emitted and awaited _before_ the write; `hardDelete` tells listeners whether to drop inventory counters.
    - `'product.deactivated'` — `{ productId: string }`. Fired only on a `true → false` flip of the `active` flag, not on an unchanged repeat write.
    - `'product.created'` — `{ productId: string; onHand: number }`. Carries the requested opening stock; the document itself is initially written with `onHand: 0`.
- **`PRODUCT_DELETED`** — String constant `'product.deleted'` for use as a shared spelling between emitter and listeners.
- **`PRODUCT_CREATED`** — String constant `'product.created'`.
- **`PRODUCT_DEACTIVATED`** — String constant `'product.deactivated'`.

## Relationships

- **`src/modules/products/service.ts`** — The emitter. Its `createById` fires `product.created`; its `deleteById` fires `product.deleted`; its `updateById` fires `product.deactivated` (only on an actual flip).
- **`src/modules/products/index.ts`** — Barrel file that re-exports the three `PRODUCT_*` constants so external modules import a single spelling.
- **`src/modules/products/module.ts`** — Module registration; imports the event constants to wire up listeners at boot.

## Notes

- **Avoids a circular import:** `product.created` exists so `products` can trigger `inventory`'s `receive()` without importing it (since `inventory` already imports `products`). A failed listener leaves `onHand` at the honest `0`, recoverable via `POST /inventory/receipts`.
- **`product.deleted` is awaited before the write**, ensuring listeners see a consistent DB state; `inventory` deletes its level row only when `hardDelete` is `true`.
- **`product.deactivated` ≠ out-of-stock.** It means "gone for a long time"; `onHand: 0` with `active: true` is merely out of stock and does _not_ fire this event.
- Constants exist so an emitter and its listeners share one literal rather than two independently typosable strings.
