---
source: src/modules/delivery/services/fulfill.ts
sha256: 573d11833fd13972e174f549c7951216e043f964ec34140d163efdbcb1ba196e
generated_at: 2026-10-29T03:40:08.036219+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/fulfill.ts

## Purpose

Fulfils a **digital** fulfillment order end-to-end in a single transaction: cuts a shipment that is simultaneously born and delivered (no tracking, no parcel), advances the order's fulfilment state, settles it, and emits both "shipped" and "delivered" announcements. It is the digital counterpart to the physical shipping pipeline — Shopify-style instant delivery where no carrier is involved.

## Key elements

- **`Fulfilled`** (interface) — the tuple `{ shipment, order }` returned by the inner act; the contract for any code that follows a committed fulfilment.
- **`fulfillAct`** (internal) — runs inside the transaction. Validates the order is processing, digital, and fulfillable; calls `cutShipment` with `delivered: true` and the remainder lines; then sequentially calls `startFulfilment` → `reportProgress` → `settleOrder` → `announceShipped` → `announceDelivered`. Returns the `Fulfilled` pair.
- **`fulfillFulfillmentOrder`** (exported) — the public entry point. Decides `mayStartFulfilment` *before* opening the transaction, delegates to `runAct`, and on success refreshes the product shelf, records an audit entry, and wraps the result in `generateSuccess(viewShipment(…))`. On refusal it records an unearned-start audit and returns the reject.

## Relationships

- **`services/act.ts`** — provides `runAct` (transaction runner), `readWithOrder` (loads fulfillment order + parent order in the session), and `refuse` (structured error helper used by every guard).
- **`services/cut.ts`** — `cutShipment` creates the `ShipmentDocument` with `delivered: true`; this is the only shipment-creation path in this file.
- **`services/progress.ts`** — `startFulfilment` records the `start` move, `reportProgress` computes the post-cut summary, `settleOrder` finalises the order.
- **`services/announce.ts`** — `announceShipped` and `announceDelivered` emit the two event announcements for the newly-delivered shipment.
- **`services/ship-gate.ts`** — `mayStartFulfilment` (pre-transaction permission check), `isOpenForShipment`, `refuseUnearnedStart`, `auditUnearnedStart`.
- **`services/actions.ts`** — `viewShipment` shapes the `Shipment` payload for the HTTP response.
- **`domain` (`domain/index.ts`, `domain/fulfillment.ts`)** — `isFulfillable` guard and `remainderLines` (the lines still to ship after prior shipments).
- **`delivery/audit.ts`** — supplies the `deliveryAuditActions.ADMIN_ORDER_FULFILLED` action key.
- **`infrastructure/observability/audit.ts`** — `recordAudit` writes the success audit row (post-transaction).
- **`infrastructure/http/response.ts`** — `generateSuccess`, `ResponseSuccess`, `ResponseReject` define the response envelope.
- **`modules/orders/index.ts`** — `orderService.refreshShelf` invalidates product-shelf caches after commit; `OrderDocument` type is carried through the act.
- **`services/index.ts`** — re-exports `fulfillFulfillmentOrder` as part of the delivery service surface.
- **`tests/unit/lost.test.ts`** — exercises the digital-fulfilment path (among other delivery scenarios) in unit tests.

## Notes

- **`mayStart` is frozen before the transaction.** `mayStartFulfilment` is evaluated outside `runAct`; a transaction retry therefore cannot flip the verdict. This is a deliberate design choice documented in the inline comment.
- **Born-and-delivered in one write.** `cutShipment` is called with `delivered: true`, so the shipment never exists in a "shipped-but-undelivered" state. The two announcements (`shipped` + `delivered`) are emitted back-to-back to keep event streams consistent with the physical pipeline.
- **Ordering inside the act matters.** `startFulfilment` runs before `reportProgress` and `settleOrder` so that the progress summary and settlement read the already-recorded `start` move.
- **Shelf refresh is post-transaction.** `orderService.refreshShelf` is called in the `.then` chain after `runAct` resolves, not inside the session — a failed transaction will not trigger a shelf refresh.
- **Digital-only guard.** If `fulfillmentOrder.kind !== 'digital'` the act refuses with `DELIVERY_NOT_DIGITAL`; this file is not a general-purpose fulfilment entry point.
