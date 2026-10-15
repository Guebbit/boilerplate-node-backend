---
source: src/modules/inventory/events.ts
sha256: 74129445e33af5f511dcae1d2b967c039e0e7a022f41340605cd820b6947931a
generated_at: 2026-10-15T10:34:45.677254+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/events.ts

## Purpose

Declares the inventory module's two domain events by augmenting the kernel's `DomainEventMap`, and exports their name constants. The events exist to decouple listeners (`orders`, `delivery`) from this module without creating an import cycle: `orders` already imports inventory, and `delivery` imports only the event name.

## Key elements

- **`DomainEventMap` augmentation** (`declare module '@kernel/events'`) — adds two payload shapes to the kernel's global event catalogue:
  - `inventory.reservation_expired` — `{ orderId: string }`. Emitted *after* the hold's stock is released; the `orders` listener cancels the order.
  - `inventory.preorder_allocated` — `{ orderId: string; productId: string; waiting: number }`. Emitted in the same outbox transaction as the allocation; `waiting` is the *remaining* preorder-claim count (a state, not a delta), making redelivery idempotent for the `delivery` listener.
- **`RESERVATION_EXPIRED`** — exported string constant (`'inventory.reservation_expired'`) so emitter and listeners share one spelling.
- **`PREORDER_ALLOCATED`** — exported string constant (`'inventory.preorder_allocated'`), same purpose.

## Relationships

- **`index.ts`** — barrel re-exports the two name constants so external consumers import from the module root.
- **`module.ts`** — module registration entry point; pairs these events with the services that emit them.
- **`services/sweep.ts`** — the service that detects hold expiries; emits `RESERVATION_EXPIRED` after releasing the reserved units.
- **`services/allocate.ts`** — the service that fulfils preorder receipts; emits `PREORDER_ALLOCATED` in the allocation's outbox transaction.
- **`tests/integration/preorder.test.ts`** — exercises the `PREORDER_ALLOCATED` flow end-to-end (allocation → event → delivery release).

## Notes

- `waiting` on `preorder_allocated` is a **state** (remaining preorder claims), not a delta. A `0` value means all preorder units for that product/order are fully allocated; `delivery` can therefore release unconditionally and safely on redelivery.
- `reservation_expired` is past-tense by design: the stock is *already* gone by the time the event fires, so the `orders` listener cancels rather than re-plans.
- Stock-level changes (counter + explanatory row) are a single write and intentionally **not** events — see `products/events.ts` for the product-side catalogue.
