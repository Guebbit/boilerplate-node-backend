---
source: src/modules/delivery/services/cancel-remainder.ts
source_sha256: 62f5f1c2e074de943004c74db7fb73a15cf11bda3a5a27e13b0f02a37882ae4f
context_sha256: 59181bc8b0b80f1458d32a1af39d8b32fe360a26a703aff7527d58243957aac1
generated_at: 2026-11-22T04:53:24.418167+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/services/cancel-remainder.ts

## Purpose
Takes fulfillment orders out of play without shipping them: either the unshipped remainder of one fulfillment order (a partial withdrawal by the buyer or staff, driven by `returns`), or every fulfillment order of an order that was canceled. `delivery` only marks the lines; money, stock and the Return record belong to `returns`, which calls this inside its own transaction.

## Key elements
- **`RemainderCancel`** – result type. Success: `{ ok: true, lines, waitingForStock, reportCanceled? }`. Failure: `{ ok: false, reason }` with `reason` one of `'not-found' | 'nothing-shipped' | 'nothing-to-cancel'`.
- **`cancelRemainder(fulfillmentOrderId, orderId, session, reason = FulfillmentCancelReason.buyer, actor?)`** – cancels the unshipped remainder of one fulfillment order inside the caller's transaction:
  - Refuses (as `ok: false`) when the fulfillment order is missing or belongs to a different order, when the order is missing, when no remainder lines exist, or when nothing has shipped and no *other* fulfillment order still has remainder lines (in that case the whole order must be canceled instead).
  - Computes `waitingForStock` (status `on_hold` with hold reason `awaiting_stock`), so `inventory` can release the right thing (preorder allowance vs. shelf units).
  - Claims the fulfillment order with an optimistic-revision update: lines become `canceledQuantity`, status is derived by `statusOfLines(..., false)`, `cancelReason` is stored, and `holdReason`/`holdNote` are unset.
  - Then calls `reportProgress`, `settleOrder`, `recordRemainderCanceled` and `announceCanceled`.
  - Returns `reportCanceled` only when settlement canceled the order (every parcel lost); the caller must invoke it after its transaction commits to write the audit row and analytics event.
- **`cancelAllForOrder(orderId)`** – the `ORDER_CANCELED` listener. Runs in its own `runAct` transaction and cancels every fulfillment order of the order with reason `FulfillmentCancelReason.order`, then announces each. Idempotent: orders already `closed` or `canceled` are skipped.

## Relationships
- **`src/modules/delivery/domain/fulfillment.ts`** and **`src/modules/delivery/domain/index.ts`**: provide `remainderLines`, `statusOfLines`, `withRemainderCanceled` and the `ProductQuantity` type.
- **`src/modules/delivery/repository.ts`**: `fulfillmentOrderRepository` supplies `findInSession`, `findByOrderId` and `claim`.
- **`src/modules/delivery/services/act.ts`**: `runAct` wraps `cancelAllForOrder` in a transaction; `refuse` throws the 409 `ActRefusal`.
- **`src/modules/delivery/services/announce.ts`**: `recordRemainderCanceled` and `announceCanceled` record and publish the cancel.
- **`src/modules/delivery/services/progress.ts`**: `reportProgress` and `settleOrder` recompute the order summary and advance or cancel the order.
- **`src/modules/orders/index.ts`**: `orderService` is imported from here and used to read the order inside the session.
- **`src/types/index.ts`**: `FulfillmentCancelReason`, `FulfillmentHoldReason`, `FulfillmentOrderStatus`.

## Notes
- Refusals are returned as `ok: false` *before* the claim. A lost claim (409 `delivery.not-shippable`) or any failure after it **throws**, aborting the caller's whole transaction, since returning would commit a claim with nothing around it.
- Canceling the remainder after every shipment had already arrived completes the order in the same transaction (`shipped` and `delivered`). The withdrawal clock counts from now, the later of the last delivery and this cancel.
- Resulting status is `closed` if something shipped from the fulfillment order, `canceled` if nothing ever did.
- `cancelAllForOrder` relies on the invariant that an order is only cancelable while nothing has shipped, so each fulfillment order is canceled in full. It iterates sequentially because a transaction session does not support parallel operations. A lost claim there is silently skipped (`if (claimed)`).
