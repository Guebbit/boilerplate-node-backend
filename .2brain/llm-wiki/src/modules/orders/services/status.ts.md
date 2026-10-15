---
source: src/modules/orders/services/status.ts
sha256: 74ace1c0eed05d49a7bf9289a97ee248b5c039e84fac9f913e10dd7039bee564
generated_at: 2026-10-15T11:11:49.056380+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/status.ts

## Purpose

The single status writer for orders. Other modules (`payments`, `delivery`) **report** a fact they have already recorded; this file decides whether the reported move still applies given the order's current status, performs the conditional write, and announces the resulting `ORDER_STATUS_CHANGED` event. No human-initiated request flows through this file.

## Key elements

- **`markPaid(orderId, paymentMethod?, by?, session?)`** — Reports that a payment settled. Stamps `paidAt` and the actual payment method, commits the inventory hold (`held → committed`) in the same transaction, and refreshes the stock cache after commit. Emits the event that triggers invoicing.
- **`markProcessing(orderId, session?, actor?)`** — Reports that fulfilment started on a paid order. Delegates to `markSystemMove('start')`.
- **`markShipped(orderId, session?, actor?)`** — Reports that the last unit left (nothing remains to ship). Delegates to `markSystemMove('ship')`.
- **`markDelivered(orderId, deliveredAt, session?, actor?)`** — Reports the last shipment arrived. Freezes the withdrawal deadline (`withdrawUntilFrom(deliveredAt, withdrawalPeriodDays())`) and writes it alongside the status.
- **`markFulfilmentComplete(orderId, at, session, actor?)`** — Reports the order became complete in one act (digital-only fulfilment, or remainder-cancel after full delivery). Performs the multi-step move (`processing → shipped → delivered`, or `processing → delivered` for digital-only) in a single write. Requires a caller-supplied session.
- **`announceMove`** *(internal)* — Transaction-aware helper: joins the caller's session or opens its own; writes conditionally then announces.
- **`markSystemMove`** *(internal)* — Shared shape for the simple single-step moves (start, ship) using the `ORDER_EVENTS` table.
- **`deliveredRow`** *(internal)* — Builds the timeline entry for a `delivered` move, including the frozen `withdrawUntil`.

## Relationships

- **`src/kernel/outbox.ts`** — Provides `announceWithin` and `announceInTransaction`, the two transaction-aware announcement primitives used by every move in this file.
- **`src/modules/inventory/index.ts` / `services/index.ts`** — `inventoryService.commitForOrder` runs in the same transaction as `markPaid`; `inventoryService.refreshStockCacheForOrder` is called post-commit when the move opened its own transaction.
- **`src/modules/orders/events.ts`** — Exports `ORDER_STATUS_CHANGED`, the event name announced after every successful move.
- **`src/modules/orders/domain/index.ts`** (and sub-modules `lifecycle`, `rules`, `timeline`, `withdrawal`, `projections`) — Source of `ORDER_EVENTS`, `isDigitalOnlyOrder`, `withdrawUntilFrom`, `withdrawalStartFor`, and the `TimelineEntryInput` / `Stamped*` types that shape the writes and timeline entries.
- **`src/modules/orders/config.ts`** — `withdrawalPeriodDays()` supplies the statutory window length.
- **`src/modules/orders/model.ts`** — `OrderDocument` is the return type of every exported move.
- **`src/modules/invoicing`** *(consumer)* — Subscribes to the `ORDER_STATUS_CHANGED` event emitted by `markPaid` to issue the invoice; the integration tests under `src/modules/invoicing/tests/integration/` exercise this flow.

## Notes

- **`markPaid` is the odd one out.** It bypasses `markSystemMove` because it stamps an extra field (`paidAt`) and carries inventory-commit logic in the same write; the shared `$set` in `markSystemMove` has no slot for that.
- **Exactly-once under races.** Every write goes through `orderRepository.updateStatusIfIn` (or `markPaid`/`markDelivered` equivalents), so a redelivered webhook or retried delivery scan that arrives after the status has already moved simply returns `null` and announces nothing.
- **`markFulfilmentComplete` always receives a session** (non-optional). Its multi-step write is atomic by contract; callers must supply the transaction.
- **Withdrawal deadline is frozen at write-time.** `markDelivered` and `markFulfilmentComplete` compute `withdrawUntil` once and persist it, mirroring the "freeze the fact at the moment it happens" convention used for `shippingCost` and `currency`.
- **`paymentMethod` in `markPaid`** is typed `'card'` only — it overrides the checkout-chosen method when the provider actually collected card payment. Offline methods leave the checkout choice untouched; the payment row carries the recorded method separately.
