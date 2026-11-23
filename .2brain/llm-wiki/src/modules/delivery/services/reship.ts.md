---
source: src/modules/delivery/services/reship.ts
generated_at: 2026-11-22T04:58:30.216053+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/services/reship.ts

## Purpose
Implements the replacement-after-a-return flow: goods already delivered are sent again under the legal guarantee. Returned units are reopened on the same fulfillment orders they originally shipped from (no new order, invoice or revenue). The stock hold is topped up, any shortfall is owed on a fulfillment order on hold, and the order returns to `processing` so the replacement ships through the normal shipping path. It runs inside the caller's transaction (a return's receipt).

## Key elements
- `reopenForReplacement(orderId, lines, session, actor)` — the exported entry point. All or nothing: any refusal aborts the caller's transaction. Steps:
  1. Reads the order (`orderService.readOrder`) and the order's fulfillment orders (`fulfillmentOrderRepository.findByOrderId`).
  2. Calls `planReopening` to decide which units reopen on which fulfillment orders.
  3. Calls `orderService.topUpStock` and keeps the lines with `owed > 0`.
  4. Calls `reopenLines`, passing `shareOwed(...)` to split the owed units across the origin orders.
  5. If anything is owed, creates an owed fulfillment order with `createOwedFulfillmentOrder`, using `promiseFor(owed, new Date())`. Titles are looked up from the existing lines.
  6. Calls `reportProgress`.
  7. Calls `orderService.reopenForFulfillment(orderId, session, actor)`.
- `reopenLines` (internal) — for each reopening, finds the origin fulfillment order. It computes new lines with `withLoss`, then claims the order through `fulfillmentOrderRepository.claim` using the order's `revision` (optimistic concurrency). The new status comes from `statusOfLines`, which keeps the order on hold if it already was.

## Relationships
- `../domain` — supplies the pure logic: `planReopening`, `shareOwed`, `statusOfLines`, `withLoss`, and the types `ProductQuantity` and `Reopening`.
- `../repository` and `../model` — `fulfillmentOrderRepository` (`findByOrderId`, `claim`) and the `FulfillmentOrderDocument` type.
- `./act` — `refuse` throws the 409 refusals (`ActRefusal`).
- `./progress` — `reportProgress` refreshes order progress after units reopen.
- `./owed` — `createOwedFulfillmentOrder` and `promiseFor` handle the part the shelf cannot cover.
- `@modules/orders` — `orderService` provides `readOrder`, `topUpStock` and `reopenForFulfillment`.
- `@types` — `FulfillmentOrderKind` and `FulfillmentOrderStatus` enums.

## Notes
- Every failure is a 409 `DELIVERY_NOT_REOPENABLE` (`delivery.not-reopenable`). The triggers are:
  - a missing order;
  - `planReopening` returning nothing, i.e. the order shipped fewer units than come back;
  - a lost `claim` (revision conflict);
  - `reopenForFulfillment` returning falsy, i.e. the order is not in a state it can ship from.
- Per the inline comment, a `delivered` or `shipped` order steps back to `processing`; any other state cannot be sent to.
- The caller must refresh the availability entry itself; this function does not.
- `reopenLines` silently skips a reopening whose origin fulfillment order is not found in the list.
- The owed order is created with `orders[0]?.orderId ?? order._id` as its order id.
- The file's module doc points to `docs/modules/delivery.md#replacement-after-a-return` for background.
