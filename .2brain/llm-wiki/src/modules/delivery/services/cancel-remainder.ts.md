---
source: src/modules/delivery/services/cancel-remainder.ts
sha256: 1d1e2f8a620d4dab5a9dd7a4ae433b0c88e8226b3ccb44a30e5e096fb7a61fdd
generated_at: 2026-11-14T19:44:35.775947+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/cancel-remainder.ts

## Purpose

Cancels the unshipped remainder of a fulfillment order (partial withdrawal via `returns`) or every fulfillment order of an order that itself was canceled. This module only touches delivery-side state (lines, status, summary); money, stock, and Return records are owned by `returns`, which drives this file inside its own transaction.

## Key elements

- **`RemainderCancel`** — discriminated union returned by `cancelRemainder`: either `ok: true` with the canceled `lines`, a `waitingForStock` flag, and an optional deferred `reportCanceled()` callback; or `ok: false` with a `reason` (`'not-found' | 'nothing-shipped' | 'nothing-to-cancel'`).
- **`cancelRemainder(fulfillmentOrderId, orderId, session, reason?, actor?)`** — Cancels unshipped lines on one fulfillment order within the **caller's** Mongoose session. All business-rule rejections return before any write; a failure after the first write throws to abort the caller's transaction. Updates lines via `withRemainderCanceled`, recomputes status, reports progress, settles the order if completion is reached, records an audit row, and announces the event.
- **`cancelAllForOrder(orderId)`** — Event-handler for `ORDER_CANCELED`. Iterates every fulfillment order of the order, cancels those still open, and announces each. Idempotent: already-closed or canceled records are skipped, so a redelivered event is a no-op.

## Relationships

- **src/modules/delivery/domain/fulfillment.ts** (imported via the **src/modules/delivery/domain/index.ts** barrel) — source of `remainderLines`, `withRemainderCanceled`, `statusOfLines`, and the `ProductQuantity` type; pure functions that transform fulfillment-order lines.
- **src/modules/delivery/repository.ts** — `fulfillmentOrderRepository.findInSession`, `.findByOrderId`, and `.claim` handle all reads and the optimistic-lock write.
- **src/modules/delivery/services/act.ts** — `refuse` raises the structured `ActRefusal` for the post-write conflict case; `runAct` wraps `cancelAllForOrder` in its own transaction.
- **src/modules/delivery/services/announce.ts** — `announceCanceled` publishes the domain event; `recordRemainderCanceled` writes the timeline/audit row for a single-order cancel.
- **src/modules/delivery/services/progress.ts** — `reportProgress` updates the order's shipment progress; `settleOrder` transitions the order to `shipped`/`delivered` when the last remainder is canceled and returns the deferred `reportCanceled` callback.
- **src/modules/delivery/services/index.ts** — barrel that re-exports this file's public API to other modules.
- **src/modules/orders/index.ts** — `orderService.readOrder` verifies the order exists and supplies `order.fulfillment.shipped` for the `nothing-shipped` guard.
- **src/modules/orders/services/index.ts** — the `ORDER_CANCELED` event listener that invokes `cancelAllForOrder`.
- **src/types/index.ts** — `FulfillmentCancelReason`, `FulfillmentHoldReason`, `FulfillmentOrderStatus` enum values used in status checks and the `cancelReason` field.

## Notes

- `cancelRemainder` does **not** open its own transaction; it runs inside the caller's (`returns`') session. A post-write failure must throw, not return, so the caller's transaction aborts rather than committing a bare claim.
- The `nothing-shipped` guard: if the order has no shipped flag, this fulfillment order can only be canceled alone while **another** fulfillment order still has remaining lines; the last live one is the whole order and must go through order-level cancel instead.
- `reportCanceled` is a **deferred callback** returned to the caller, who invokes it only after its own transaction commits (it writes the audit row and analytics event outside the transaction boundary).
- `cancelAllForOrder` loops sequentially because a Mongoose `ClientSession` does not support parallel operations.
- `waitingForStock` is true when the fulfillment order is on hold for stock; the caller (`returns`) uses it to decide whether to return a preorder-allowance claim or shelf units back to `inventory`.
