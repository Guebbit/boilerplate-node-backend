---
source: src/modules/orders/services/status.ts
source_sha256: 7b3d6d6259c96a587112019028e45750caee06c0f8cbef43a85c8f68e7836e41
context_sha256: f2c8244e384cd1735357903b73c3204b7b4110bdae06a6f924cd21cc358bface
generated_at: 2026-11-22T06:24:30.606715+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/services/status.ts

## Purpose
Handles status moves that other modules (`payments`, `delivery`) *report* to `orders`. `orders` is the only status writer in the application. A reporting module asks for the move, and this file decides whether it still applies. When the move lands, the file announces it through the outbox.

## Key elements
- `markPaid(orderId, paymentMethod?, by?, session?)` reports that a payment settled.
  - It uses its own conditional write (`orderRepository.markPaid`) because it also stamps `paidAt`.
  - It first checks that the order is still payable.
  - For late money, it calls `inventoryService.retakeReleasedForOrder` before the `paid` write.
    - If stock is `short`, it returns `null`, so the payment is refunded.
    - If the order is paid, it commits stock with `commitForOrder`.
    - If a racing move won the order, it releases the retaken units with `releaseForOrder`.
  - It returns `null` if the order could no longer be paid.
- `markProcessing(orderId, session?, actor?)` reports that fulfillment started. It is a system move for `process`.
- `markShipped(orderId, session?, actor?)` reports that the last unit left. It is a system move for `ship`. A shipment that leaves units behind never reaches it.
- `markReopened(orderId, session?, actor?)` moves a `shipped` order back to `processing` after a lost shipment. It is a system move for `reopen`.
- A further function for the `reship` move (a replacement under the legal guarantee) is documented where the visible content ends. This page does not describe it further.
- `markSystemMove` (internal) is the shared shape for `process`, `ship`, `reopen` and `reship`.
  - It takes `from` and `to` from `ORDER_EVENTS[event]`.
  - It calls `orderRepository.updateStatusIfIn`, a conditional write. Two callers racing the same fact land and announce it exactly once.
  - It adds a timeline row through `withTimeline`. `MOVE_ROW` maps `process` to `processing` and `ship` to `shipped`. `reopen` and `reship` add no row, because the loss or return that caused them has its own.
- `announceMove` (internal) announces inside the caller's session via `announceWithin`. With no session it opens its own transaction via `announceInTransaction`.
- `settleRetaken` and the `Retaken` type (internal) finish a late payment once its units are back.

## Relationships
- `src/kernel/outbox.ts` provides `announceInTransaction`, `announceWithin` and `OutboxAnnouncements`. Every move is announced as an `ORDER_STATUS_CHANGED` event built by `statusChangedEvent` from `./announce`.
- `src/modules/inventory/index.ts` provides `inventoryService`. `markPaid` uses it to retake, commit and release stock. `src/modules/inventory/services/index.ts` sits beside it in the graph.
- `src/modules/orders/domain/*` (`lifecycle.ts`, `fulfillment.ts`, `projections.ts`) supplies `ORDER_EVENTS`, `isPayable`, the delivery-clock and withdrawal helpers, and related types, re-exported from `../domain`.
- `src/modules/orders/config.ts` supplies `withdrawalPeriodDays`.
- `./cancel` supplies `CANCEL_CAUSES` and `afterCancel`. `./timeline` supplies `withTimeline`. Both are imported by this file.
- `payments` calls `markPaid`, and `delivery` calls the other moves. The `delivery` integration test is among the graph neighbors.
- `invoicing` subscribes to the `ORDER_STATUS_CHANGED` event emitted by `markPaid` and issues the invoice. Its contract and integration tests are graph neighbors.

## Notes
- `markPaid` is `@internal` and friend-only to `payments` (`src/modules/orders/friends/payments.ts`). It moves an order to paid unchecked.
- With a `session`, the caller must wake the outbox relay after its commit.
- A return of `null` means this call did not move the order. It does not signal an error.
- `markPaid` sets `method` from `by.method`, then `paymentMethod`, then `order.paymentMethod`. If none is known, the key is omitted rather than `null`.
- Some imports (such as `ORDER_CANCELED`, `UNDELIVERABLE_EVENT`, `deliveryClockFor` and `afterCancel`) are not used in the visible portion. They are presumably used further down the file.
