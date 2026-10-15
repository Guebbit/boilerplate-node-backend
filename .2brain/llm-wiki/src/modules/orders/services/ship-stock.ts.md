---
source: src/modules/orders/services/ship-stock.ts
sha256: 89098269a00e0f026f69cee6b2017ce995741221bc1ab85de3479ed6f28e36bc
generated_at: 2026-10-15T11:11:02.118937+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/ship-stock.ts

## Purpose

Provides a single atomic operation for the **override** path: when an order's status is forced forward (to `shipped` or `delivered`), ship all remaining held stock for that order and publish the resulting domain events in one transaction. It is the "whole-remainder" counterpart to the per-shipment `shipStock` in `./fulfillment`, ensuring the shelf count drops at dispatch time rather than at payment time.

## Key elements

- **`announceMoveShippingStock(orderId, write, announce)`** — The sole export. Orchestrates, in order:
  1. `write(session)` — a caller-supplied conditional status write (returns the updated `OrderDocument`, or `null` on a lost race).
  2. `inventoryService.shipForOrder(orderId, session)` — releases the order's remaining held units, inside the same Mongoose session.
  3. `announceInTransaction(…)` — publishes domain events via the outbox within the transaction.
  4. `inventoryService.refreshStockCacheForOrder(orderId)` — post-commit only; refreshes the stock cache that lives outside the transaction and cannot roll back.

  Returns the current `OrderDocument`, or `null` if the write matched nothing (no stock moved, no events fired).

## Relationships

- **`src/kernel/outbox.ts`** — Imports `announceInTransaction` and the `OutboxAnnouncements` type; the entire announce step is delegated to the kernel's outbox helper so events and state changes commit atomically.
- **`src/kernel/events.ts`** — Imports `DomainEventName` to type the event names accepted by the `announce` callback.
- **`src/modules/inventory/index.ts`** — Imports `inventoryService`; calls `shipForOrder` (in-transaction) and `refreshStockCacheForOrder` (post-commit).
- **`src/modules/orders/model.ts`** — Imports the `OrderDocument` type used as the return shape of the `write` callback and the function itself.
- **`src/modules/orders/services/override.ts`** — Noted in the module doc comment as the sibling "override" path; this file handles the stock side when that override forces a status forward.

## Notes

- **Post-commit cache refresh is intentional.** The stock cache sits outside the Mongoose session and cannot be rolled back, so it is updated *after* `announceInTransaction` resolves. Callers must not assume the cache is consistent within the transaction window.
- **`null` return is a normal path**, not an error: it means the conditional write lost a race and no stock was touched.
- This is the **override** (whole-remainder) variant. The regular per-shipment flow uses `./fulfillment`'s `shipStock` instead; do not conflate the two.
- The `write` and `announce` parameters are **caller-supplied closures**, making this a thin orchestration wrapper; all business-specific status logic lives in the caller (typically `override.ts`).
