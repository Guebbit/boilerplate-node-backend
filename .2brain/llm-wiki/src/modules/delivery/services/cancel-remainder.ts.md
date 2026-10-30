---
source: src/modules/delivery/services/cancel-remainder.ts
sha256: 53598668474b78ca38a42180255da8fcd89eedba56e5fedf75f8dd1fb472681c
generated_at: 2026-10-29T03:38:33.992089+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/cancel-remainder.ts

## Purpose

Cancels the unshipped remainder of a fulfillment order (partial withdrawal) or every fulfillment order of an order that itself was cancelled. It is a "door" called by the `returns` module inside the caller's own transaction, because `returns` already owns the money, stock, and Return-record writes and must keep them atomic with the delivery-side status change.

## Key elements

- **`RemainderCancel`** (type) — Discriminated union return type: `{ ok: true; lines; waitingForStock }` or `{ ok: false; reason: 'not-found' | 'nothing-shipped' | 'nothing-to-cancel' }`.
- **`cancelRemainder(fulfillmentOrderId, orderId, session, reason?, actor?)`** — Cancels all unshipped lines on one fulfillment order. Validates existence and that another fulfillment order still holds units (if nothing has shipped yet), claims the row via optimistic concurrency, recomputes order progress, settles the order, and fires cancellation announcements. Runs entirely inside the caller's `ClientSession`.
- **`cancelAllForOrder(orderId)`** — Event-listener entry point for `ORDER_CANCELLED`. Iterates every fulfillment order of the order and cancels its full quantity. Idempotent: skips rows already `closed` or `cancelled`. Uses `runAct` to open its own short transaction.

## Relationships

- **`../domain` (`src/modules/delivery/domain/index.ts`)** — Imports `remainderLines`, `statusOfLines`, `withRemainderCancelled`, and the `ProductQuantity` type; these pure helpers compute the new line quantities and the resulting fulfillment-order status.
- **`../repository` (`src/modules/delivery/repository.ts`)** — All persistence goes through `fulfillmentOrderRepository` (`findInSession`, `findByOrderId`, `claim`); no direct model access in this file.
- **`./act` (`src/modules/delivery/services/act.ts`)** — `refuse` produces the `ActRefusal` thrown on a lost concurrency claim; `runAct` wraps `cancelAllForOrder` in its own transaction.
- **`./announce` (`src/modules/delivery/services/announce.ts`)** — `recordRemainderCancelled` writes the timeline row for a single-cancel; `announceCancelled` emits the domain event after the row is claimed.
- **`./progress` (`src/modules/delivery/services/progress.ts`)** — `reportProgress` recomputes the order's aggregate status/summary; `settleOrder` persists the transition (e.g. to `shipped`/`delivered`) and starts the withdrawal clock.
- **`@modules/orders` (`src/modules/orders/index.ts`)** — `orderService.readOrder` fetches the parent order to check `fulfillment.shipped` and to read the order ID for progress/settlement.
- **`@types` (`src/types/index.ts`)** — Enum values `FulfillmentCancelReason`, `FulfillmentHoldReason`, `FulfillmentOrderStatus` used in status logic and stored on the row.

## Notes

- **Transaction ownership:** `cancelRemainder` does *not* open its own transaction; the caller (the `returns` service) passes in the session. A failure *after* the first write throws to abort that whole transaction — returning a value there would commit a partial claim.
- **Pre-write refusals** (`not-found`, `nothing-shipped`, `nothing-to-cancel`) are returned as `{ ok: false }` and never touch the database write path.
- **`waitingForStock`** flag: when the fulfillment order was on hold for stock, the cancelled lines represent a preorder allowance rather than shelf units; the caller uses this to pick the correct inventory rollback.
- **Status derivation:** `statusOfLines(lines, false)` yields `closed` if any line was partially shipped, `cancelled` if nothing ever shipped. Hold fields (`holdReason`, `holdNote`) are explicitly unset on cancel.
- **`cancelAllForOrder` is sequential by design** — a Mongoose transaction session does not support parallel operations, so fulfillment orders are claimed one after another in a `for` loop.
- **Order can reach terminal state here:** cancelling the last remainder after every shipment has already arrived transitions the order to `shipped` + `delivered` in the same transaction, with the withdrawal clock starting from *now* (the later of last-delivery and this cancel).
