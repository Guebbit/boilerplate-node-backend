---
source: src/modules/orders/services/status.ts
sha256: ee390f0215ddd3ef34367ff6e8a2400a9cc0969c48686c94c96250e485016ec6
generated_at: 2026-11-14T20:47:28.812815+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/status.ts

## Purpose

The single writer of order status in the application. Other modules (`payments`, `delivery`) **report** a fact they have already recorded; this file decides whether the status move still applies (conditional write against the current status), executes it inside a transaction, appends a timeline entry, and announces the change via the outbox. It never acts on a human request — every call here is a system reporting another module's completed act.

## Key elements

- **`markPaid(orderId, paymentMethod?, by?, session?)`** — Reports that a payment settled. The only destination that stamps extra data (`paidAt`, `paymentMethod`) in the same write, so it does not use the shared `markSystemMove` path. Handles late-payment stock recovery: retakes released units, commits on success, releases on race loss, returns `null` (triggering refund) if units are short. `@internal` friend-only to `payments`.
- **`markProcessing(orderId, session?, actor?)`** — Reports fulfillment started. Called by `delivery`'s `POST /orders/{id}/process`.
- **`markShipped(orderId, session?, actor?)`** — Reports the last unit left the warehouse. Called by `delivery`'s shipping act inside its own transaction.
- **`markReopened(orderId, session?, actor?)`** — Reports a shipment was lost; order returns to `processing`. Reached via `reopenForFulfillment` from `delivery`.
- **`markSystemMove(orderId, event, session?, actor?)`** — Shared helper for `process`/`ship`/`reopen`/`reship`. Reads the `from`/`to` pair from `ORDER_EVENTS`, performs a conditional `updateStatusIfIn`, wraps with timeline, and announces.
- **`announceMove(session, write, announce)`** — Transaction wrapper: uses the caller's session if provided (`announceWithin`), otherwise opens its own (`announceInTransaction`). Ensures the conditional write and the outbox announcement are atomic.
- **`settleRetaken(orderId, retake, movePaid, session)`** — Post-payment tail: commits stock if the `paid` write won, or releases retaken units if a racing move lost the order.
- **`MOVE_ROW`** — Maps event names to timeline row types; `reopen` and `reship` intentionally leave no row (the causing loss/return carries its own).
- **`Retaken`** — Type narrowing of `inventoryService.retakeReleasedForOrder` return, excluding `'short'`.

## Relationships

- **`src/kernel/outbox.ts`** — Provides `announceInTransaction`, `announceWithin`, and the `OutboxAnnouncements` type. Every status move is announced through the outbox; the caller wakes the relay after its own commit.
- **`src/modules/inventory/index.ts` / `src/modules/inventory/services/index.ts`** — Exposes `inventoryService` for `retakeReleasedForOrder`, `commitForOrder`, and `releaseForOrder`. Stock holds transition (`held → committed` or back) in the same transaction as the status write.
- **`src/modules/orders/domain/index.ts`** — Barrel re-exporting the domain constants and helpers this file consumes: `ORDER_EVENTS`, `isPayable`, `isDigitalOnlyOrder`, `NO_FULFILLMENT`, `settlementFor`, `conformityUntilFrom`, `deliveryClockFor`, `withdrawUntilFrom`, and related types.
- **`src/modules/orders/domain/lifecycle.ts`** — Source of `ORDER_EVENTS` (the `from`/`to` transition table) and `OrderEventName`.
- **`src/modules/orders/domain/rules.ts`** — Source of `isPayable`, `isDigitalOnlyOrder`, `NO_FULFILLMENT`, `settlementFor`.
- **`src/modules/orders/domain/projections.ts`** — Source of `conformityUntilFrom`, `deliveryClockFor`, `withdrawUntilFrom`, `DeliveryClock`, `StampedPaymentStatus`, `StampedReturnStatus`.
- **`src/modules/orders/domain/fulfillment.ts`** — Source of fulfillment-related helpers consumed indirectly through the domain barrel.
- **`src/modules/orders/config.ts`** — Provides `withdrawalPeriodDays` used for timeline/retention calculations.

## Notes

- **Conditional writes are the concurrency guard.** Two callers racing the same fact (redelivered webhook, retried delivery scan) both call in; only one `updateStatusIfIn` matches, the other gets `null` and announces nothing. No explicit locking.
- **`markPaid` bypasses `markSystemMove` on purpose.** It needs an extra `$set` slot (`paidAt`, optional `paymentMethod`) that the shared helper's shape has no room for.
- **`reopen` and `reship` write no timeline row.** The `MOVE_ROW` map returns `undefined` for them; the timeline entry belongs to the loss or return that *caused* the reopen.
- **Late-payment stock logic is in the write path, not a separate step.** `markPaid` calls `retakeReleasedForOrder` *before* the `paid` write so the retake and status change share one transaction. If the retake is `short`, the write is skipped entirely and the caller refunds.
- **`@internal` on `markPaid`.** It is friend-only to `payments` (via `friends/payments.ts`) and moves an order to `paid` without the usual guard checks. Other modules should not import it directly.
- **Session semantics:** when a caller passes a `session`, the outbox relay is the caller's responsibility to wake post-commit. When no session is passed, `announceInTransaction` opens and commits its own transaction including the relay wake.
