---
source: src/modules/inventory/events.ts
sha256: 5413a0f6d72ea3d74c7698a9c8f4b3c4e51bab06caee752a8a49f26153d0ce16
generated_at: 2026-11-08T05:59:05.887899+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/events.ts

## Purpose

Declares the inventory module's domain events by augmenting the kernel's `DomainEventMap` interface and exports one named constant per event. Its role is to let downstream modules (`orders`, `delivery`, `tasks`) react to inventory state changes without importing the inventory services back, thereby avoiding circular dependencies.

## Key elements

- **`declare module '@kernel/events'`** — Augments `DomainEventMap` with four payload shapes:
  - `inventory.reservation_expired` `{ orderId }` — hold window closed before payment; units already released. Emitted *after* the release.
  - `inventory.backorder_allocated` `{ orderId, productId, waiting }` — preorder units became set-aside stock. `waiting` is the *remaining* preorder claim (a state, not a delta), making redelivery idempotent.
  - `inventory.stock_retaken` `{ orderId, productIds }` — payment landed on an already-released hold; counters re-taken. Listener refreshes the catalogue's stock copy.
  - `inventory.hold_orphaned` `{ orderId }` — order paid but no hold existed or could be re-acquired. Internal only (no AsyncAPI channel).
- **`RESERVATION_EXPIRED`** — constant for `'inventory.reservation_expired'`.
- **`PREORDER_ALLOCATED`** — constant for `'inventory.backorder_allocated'`.
- **`STOCK_RETAKEN`** — constant for `'inventory.stock_retaken'`.
- **`HOLD_ORPHANED`** — constant for `'inventory.hold_orphaned'`.

## Relationships

- **`src/modules/inventory/index.ts`** — barrel that re-exports the four constants so emitters and listeners share a single spelling.
- **`src/modules/inventory/services/holds.ts`** — expected emitter of `RESERVATION_EXPIRED` and `STOCK_RETAKEN` (hold lifecycle and payment-time retake).
- **`src/modules/inventory/services/allocate.ts`** — expected emitter of `PREORDER_ALLOCATED` and `HOLD_ORPHANED` (allocation and payment transactions).
- **`src/modules/inventory/module.ts`** — module registration entry point that wires these events into the kernel's event bus.
- **`src/modules/inventory/tests/integration/preorder.test.ts`**, **`preorder-cache.test.ts`**, **`service.test.ts`** — integration tests that exercise the emit-and-consume paths for these events.

## Notes

- **Past-tense naming is intentional.** `reservation_expired` is emitted *after* the release, so the listener (`orders`) cancels rather than approves a plan against already-gone stock.
- **`waiting` is a state, not a delta.** A redelivery of `backorder_allocated` is harmless: `delivery` releases only what exceeds `waiting`; the second time, nothing remains.
- **`hold_orphaned` is internal-only.** No AsyncAPI channel carries it; `tasks` is the sole listener.
- **Stock-counter changes are *not* events here.** They live in `products/events.ts` because the counter write and its explanatory row are a single atomic write.
- **Design constraint:** the events exist specifically to break import cycles — `orders` already imports this module for hold operations, so the event avoids importing `orders` back.
