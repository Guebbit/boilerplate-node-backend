---
source: src/modules/orders/services/status.ts
sha256: 9c8ee93cf144eb85c20b29b95d779a02f3d31bbdf7812de38738a2a88f78baab
generated_at: 2026-11-08T07:01:41.895682+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/status.ts

## Purpose

The single status writer for the `orders` module. Other modules (`payments`, `delivery`, `returns`) **report** facts they have already recorded; this file decides whether the reported move still applies to the order's current status, writes it conditionally, and announces the resulting event. It is never the entry point for a human request — that path lives in `override` or `cancel`.

## Key elements

- **`markPaid`** — Reports that a payment settled. Special-cased beyond `markSystemMove` because it stamps `paidAt` in the same write and must retake released inventory units before committing. Returns `null` if the order is no longer payable or the retake comes up short, routing the caller into the refund path.
- **`markProcessing`** — Reports fulfillment started (`processing → shipped` precondition). Thin wrapper around `markSystemMove`.
- **`markShipped`** — Reports the last unit left the warehouse. Called by `delivery` inside its own transaction after writing the shipment record.
- **`markReopened`** — Reports a lost parcel; moves `shipped → processing`. Leaves **no** timeline row (the loss event does).
- **`markReshipped`** — Reports a replacement under legal guarantee; moves `delivered → processing`. Leaves **no** timeline row (the return receipt does).
- **`markSystemMove`** (internal) — Shared helper for the four non-paid moves: reads `from`/`to` from `ORDER_EVENTS`, builds the conditional repository write wrapped in `withTimeline`, and pairs it with `statusChangedEvent` via `announceMove`.
- **`announceMove`** (internal) — Routes the write+announce through the caller's transaction (`announceWithin`) or opens its own (`announceInTransaction`).
- **`MOVE_ROW`** (internal const) — Maps each event name to its `timeline.type` string; `reopen` and `reship` are `undefined`.
- **`deliveredRow`** (internal, truncated) — Builds the timeline entry for a `delivered` transition, carrying the frozen `withdrawUntil` date.

## Relationships

- **`@kernel/outbox`** — Consumes `announceInTransaction`, `announceWithin`, and the `OutboxAnnouncements` type to guarantee exactly-once event emission per move.
- **`@modules/inventory`** — Calls `inventoryService.retakeReleasedForOrder`, `commitForOrder`, and `releaseForOrder` inside `markPaid`'s write to hold/commit/release stock atomically with the status write.
- **`../domain` (index)** — Imports `ORDER_EVENTS`, `isPayable`, `isDigitalOnlyOrder`, `UNDELIVERABLE_EVENT`, `conformityUntilFrom`, `deliveryClockFor`, `withdrawUntilFrom`, and related types. The `from`/`to` transition sets come from here.
- **`../repository`** — Calls `orderRepository.updateStatusIfIn`, `markPaid`, and `findInSession` for the conditional writes.
- **`../events`** — References `ORDER_STATUS_CHANGED` and `ORDER_CANCELED` event constants.
- **`../model`** — Uses `OrderDocument` as the return type of every public function.
- **`./announce`** — Calls `statusChangedEvent` to build the outbox announcement payload.
- **`./cancel`** — Imports `CANCEL_CAUSES` and `afterCancel` (visible in the import list; likely used in the truncated `delivered`/cancel-adjacent logic).
- **`../config`** — Reads `withdrawalPeriodDays` for deadline calculations.

## Notes

- **Only one status writer.** The module docblock and `docs/theory/tactical-ddd.md §1` establish that no other code path writes `order.status` directly. Any new move must go through this file.
- **Idempotency via conditional writes.** Every move uses `updateStatusIfIn` (or `markPaid`), so a redelivered webhook or retried delivery scan that races the first attempt simply matches no rows and announces nothing.
- **`markPaid` is not a `markSystemMove`.** It stamps `paidAt` in the same `$set`, which the shared helper has no slot for, and it must interleave inventory retake/commit/release around the write.
- **`reopen` / `reship` produce no timeline entry.** The causal event (loss report, return receipt) owns its own timeline row; adding one here would duplicate history.
- **`null` return is meaningful.** It means "this call did not move the order." Callers (e.g. `payments`) use that to trigger refunds or skip further work — it is not an error.
- **`paymentMethod` parameter is `'card' | undefined` only.** Offline methods are recorded on the payment row, not re-stamped on the order.
