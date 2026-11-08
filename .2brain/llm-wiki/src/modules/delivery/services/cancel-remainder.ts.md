---
source: src/modules/delivery/services/cancel-remainder.ts
sha256: 3a3845513d9ec154960b62f60f5b9f470f7d5a5fbf7591a9472dd1e8857f8517
generated_at: 2026-11-08T05:34:21.653098+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/cancel-remainder.ts

## Purpose

Marks unshipped lines on fulfillment orders as canceled. It is the delivery-side door that `returns` calls (inside its own transaction) when a buyer or staff partially withdraws, and the listener hook when an entire order is canceled. Money, stock, and Return records are owned by `returns`; this file only updates fulfillment-order lines, status, and order settlement.

## Key elements

- **`RemainderCancel`** — discriminated union return type. `ok: true` carries the canceled `ProductQuantity[]`, a `waitingForStock` flag, and an optional deferred `reportCanceled()` callback. `ok: false` carries a reason: `not-found`, `nothing-shipped`, or `nothing-to-cancel`.
- **`cancelRemainder(fulfillmentOrderId, orderId, session, reason?, actor?)`** — Cancels the unshipped remainder of one fulfillment order *within the caller's Mongoose session*. Guards: fulfillment order must exist and belong to the given order; at least one remainder line must remain; if nothing has shipped from the order, at least one *other* fulfillment order must still hold units (otherwise the whole order should be canceled instead). On success, writes canceled lines, recomputes status/summary, settles the order, and fires announcements.
- **`cancelAllForOrder(orderId)`** — Event-listener entry point for `ORDER_CANCELED`. Opens its own transaction via `runAct`, iterates all fulfillment orders for the order, and cancels each non-closed/non-canceled one. Idempotent: already-terminated fulfillment orders are skipped so a redelivered event is a no-op.

## Relationships

- **`../domain` (fulfillment.ts, index.ts)** — Pure helpers: `remainderLines`, `statusOfLines`, `withRemainderCanceled`, and the `ProductQuantity` type.
- **`../repository.ts`** — `fulfillmentOrderRepository.findInSession`, `.findByOrderId`, `.claim` (optimistic-revision write).
- **`./act.ts`** — `refuse` (409 structured refusal) and `runAct` (wraps `cancelAllForOrder` in a new transaction).
- **`./announce.ts`** — `announceCanceled` and `recordRemainderCanceled` fire domain events / audit side-effects within the same session.
- **`./progress.ts`** — `reportProgress` recomputes the order's fulfillment summary; `settleOrder` transitions the parent order to `shipped`/`delivered` if this cancel completes it.
- **`@modules/orders` (index.ts / services)** — `orderService.readOrder` to validate the parent order; the orders module's `ORDER_CANCELED` event listener invokes `cancelAllForOrder`.
- **`@types` (types/index.ts)** — `FulfillmentCancelReason`, `FulfillmentHoldReason`, `FulfillmentOrderStatus` enums.
- **`./index.ts`** — Barrel re-export so `returns` can import both functions from the services facade.

## Notes

- `cancelRemainder` deliberately does **not** open its own transaction; it runs inside `returns`'s session. All pre-write checks return `ok: false`; any post-write failure throws, forcing the caller's entire transaction to roll back (prevents committing a claim with nothing around it).
- `cancelAllForOrder` **does** open its own transaction via `runAct` because it is event-driven and has no external caller transaction.
- The `nothing-shipped` guard means a single fulfillment order cannot be canceled in isolation when it is the only one holding unshipped units — the caller must cancel the whole order instead.
- `reportCanceled` is returned as a **deferred callback** so the caller (`returns`) can write the audit row and analytics event only after its own transaction commits, keeping those writes outside the transactional boundary.
- `waitingForStock` is `true` when the fulfillment order was `on_hold` for `awaiting_stock`; the caller uses it to release a preorder-allowance claim rather than shelf stock.
- `cancelAllForOrder` processes fulfillment orders **sequentially** (for-loop) because a Mongoose transaction session does not support parallel operations.
