---
source: src/modules/orders/services/status.ts
sha256: 0c2585dd4c0c8d0b59adeac8b204a433eea138c5694f58d676c04551c0412b0f
generated_at: 2026-10-29T04:50:22.988144+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/status.ts

## Purpose

The single writer of order status transitions in this application. Other modules (`payments`, `delivery`, `returns`) report a fact they have already recorded; this file decides whether the fact still applies (via a conditional `from`-status check) and, if so, writes the new status and announces it exactly once. It enforces the tactical-DDD rule that `orders` is the only module that mutates `Order.status`.

## Key elements

- **`markPaid(orderId, paymentMethod?, by?, session?)`** — Reports a settled payment. Has its own repository write (`orderRepository.markPaid`) because it stamps `paidAt` in the same `$set`. Also coordinates inventory: retakes released units if the hold window closed before payment landed, then commits stock. Returns `null` (→ refund path) when the order is no longer payable or stock is short.
- **`markProcessing(orderId, session?, actor?)`** — Reports that fulfilment started. Delegates to `markSystemMove('process')`.
- **`markShipped(orderId, session?, actor?)`** — Reports the last unit left for shipping. Delegates to `markSystemMove('ship')`.
- **`markReopened(orderId, session?, actor?)`** — Reports a lost shipment; order goes back to `processing`. No timeline row is written (the loss event owns it).
- **`markReshipped(orderId, session?, actor?)`** — Reports a legal-guarantee replacement on a `delivered` order; back to `processing`. No timeline row.
- **`markSystemMove(orderId, event, session?, actor?)`** *(internal)* — Shared shape for the four non-`paid` moves: reads `from`/`to` from `ORDER_EVENTS[event]`, performs a conditional `updateStatusIfIn`, wraps in `withTimeline`, and announces via `statusChangedEvent`.
- **`announceMove(session, write, announce)`** *(internal)* — Routes the write+announce into the caller's transaction (`announceWithin`) or opens its own (`announceInTransaction`).
- **`MOVE_ROW`** *(constant)* — Maps each event name to its timeline entry `type`; `reopen` and `reship` map to `undefined` (no row).
- **`deliveredRow(withdrawUntil, actor)`** *(internal)* — Builds the `delivered` timeline row carrying the frozen withdrawal deadline.

## Relationships

- **`src/kernel/outbox.ts`** — Provides `announceInTransaction` / `announceWithin` / `OutboxAnnouncements`; every status change is announced through the outbox relay.
- **`src/modules/inventory/services/index.ts`** — `inventoryService.retakeReleasedForOrder`, `commitForOrder`, `releaseForOrder` are called inside `markPaid` to move the stock ledger in the same transaction.
- **`src/modules/orders/repository.ts`** — `orderRepository.updateStatusIfIn`, `markPaid`, `findInSession` supply the conditional (idempotent) writes.
- **`src/modules/orders/services/announce.ts`** — `statusChangedEvent` builds the `ORDER_STATUS_CHANGED` payload announced after each successful move.
- **`src/modules/orders/domain/index.ts`** (and sub-modules `lifecycle`, `rules`, `timeline`, `withdrawal`, `projections`) — Supplies `ORDER_EVENTS` (the `from`/`to` table), `isPayable`, `isDigitalOnlyOrder`, `conformityUntilFrom`, `deliveryClockFor`, `withdrawUntilFrom`, and the `TimelineEntryInput` / `Stamped*` types.
- **`src/modules/orders/events.ts`** — Defines `ORDER_STATUS_CHANGED` and `ORDER_CANCELLED` event constants used in outbox announcements.
- **`src/modules/orders/config.ts`** — `withdrawalPeriodDays` seeds the withdrawal deadline stamped on `delivered` moves.
- **`src/modules/orders/services/cancel.ts`** — `CANCEL_CAUSES` is imported (used in the truncated portion for cancellation-adjacent logic).
- **`src/modules/orders/model.ts`** — `OrderDocument` type for all return values.

## Notes

- **`markPaid` is structurally different** from the other four exports. It does *not* go through `markSystemMove` because the repository write must also set `paidAt`; it instead calls `orderRepository.markPaid` directly. All other moves share the `updateStatusIfIn` + `ORDER_EVENTS` path.
- **Conditional writes are the idempotency guarantee.** Two racing callers (redelivered webhook, retried scan) both execute `updateStatusIfIn`; only one matches the `from` set and writes, the other gets `null` and announces nothing.
- **`markPaid` retake-then-commit ordering.** If the inventory hold was already released, units are retaken *before* the `paid` write. If the retake is short, `null` is returned and the caller (payments) refunds. If the status write then fails (racing move), already-retaken units are released again.
- **`reopen` and `reship` write no timeline row.** Their causal event (the loss, the return receipt) is responsible for the timeline entry; `MOVE_ROW` encodes this as `undefined`.
- **`paymentMethod` param on `markPaid`** only overrides to `'card'` when the provider actually took money; it never clears an existing checkout choice. An unknown method is omitted from the timeline `data` object (absent key, not `null`).
