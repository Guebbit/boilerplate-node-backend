---
source: src/modules/inventory/events.ts
sha256: 754263412e1c39f331ea33f8c73cf72845a9a6d54b2629c2c2a6d97de414cfd9
generated_at: 2026-10-29T04:00:37.613315+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/events.ts

## Purpose

Declares the inventory module's four domain events by augmenting the kernel's `DomainEventMap` interface, and exports a typed constant for each event name. The events exist to break import cycles (e.g., `orders` already imports inventory, so it listens to an event rather than inventory calling back) and to give cross-module listeners a single, typo-safe string to subscribe to.

## Key elements

- **`declare module '@kernel/events'`** — Augments `DomainEventMap` with four payload shapes:
  - `inventory.reservation_expired` (`{ orderId }`) — hold timed out *after* release; `orders` cancels the order.
  - `inventory.backorder_allocated` (`{ orderId, productId, waiting }`) — preorder units became real allocation; `waiting` is the remaining preorder claim (idempotent on redelivery).
  - `inventory.stock_retaken` (`{ orderId, productIds }`) — payment re-acquired units on a released hold; triggers a catalogue stock refresh.
  - `inventory.hold_orphaned` (`{ orderId }`) — order paid with no hold present; `tickets` opens work. Internal-only (no AsyncAPI channel).
- **`RESERVATION_EXPIRED`**, **`PREORDER_ALLOCATED`**, **`STOCK_RETAKEN`**, **`HOLD_ORPHANED`** — Exported string constants equal to the event names above, so emitters and listeners share one spelling.

## Relationships

- **`src/modules/inventory/index.ts`** — Barrel that re-exports the four constants for external consumers.
- **`src/modules/inventory/module.ts`** — Module registration; the events declared here become part of the module's event catalogue.
- **`src/modules/inventory/services/allocate.ts`** — Emits `PREORDER_ALLOCATED` (inside the receipt's outbox transaction) and `HOLD_ORPHANED` (inside the payment transaction).
- **`src/modules/inventory/services/holds.ts`** — Emits `RESERVATION_EXPIRED` after releasing the hold's units.
- **`src/modules/inventory/services/sweep.ts`** — Sweep logic that may trigger hold expiry, producing `RESERVATION_EXPIRED`.
- **Tests** (`preorder-cache.test.ts`, `preorder.test.ts`, `service.test.ts`) — Integration tests that assert the above events fire with the correct payloads during allocation and hold lifecycle flows.

## Notes

- Stock *level* changes are intentionally **not** events here; they live in `products/events.ts` because the counter write and its explanatory row are a single transactional write.
- `inventory.hold_orphaned` is marked internal-only: it has no AsyncAPI channel, so it is consumed by an in-process listener (`tickets`) rather than a message broker.
- `backorder_allocated.waiting` is an absolute remaining count, not a delta, making redelivery idempotent by design.
- `stock_retaken` refreshes the catalogue's stock copy *eventually*; the authoritative counters moved in the payment's own transaction where the catalogue copy could not be written safely (no rollback).
