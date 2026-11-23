---
source: src/modules/delivery/services/split.ts
source_sha256: adc59cbac2a670e37c76fc514323f8ab5f3be4a1755c35f9d0d21b38a3f25b2f
context_sha256: 9a659ee9d31a267aaa224b5c808897eebf8b6ff4fc28693e82352300f09b8587
generated_at: 2026-11-22T04:59:39.965854+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/services/split.ts

## Purpose
Implements the system split of a short stock delivery. When a preorder line asked for more units than arrived (e.g. 3 requested, 2 allocated), the allocated units move to a new `open` fulfillment order that can ship, and the remainder stays `on_hold` for `awaiting_stock`. It mirrors Shopify's `fulfillmentOrderSplit`. It is not reachable from any route and staff have no button for it; it is triggered when `inventory` allocates stock to a paid preorder.

## Key elements
- `splitForAllocation(fulfillmentOrderId, allocated)`: the exported entry point. Loads the fulfillment order and its parent order, returns `undefined` if either is missing or the order is `canceled`, and otherwise runs `splitAct` in a transaction via `runActOrThrow`.
- `Split` (interface): the result. `released` is the order that may ship now, and `held` is the order still waiting (absent when the allocation covered everything).
- `splitAct` (internal): the transactional logic.
  - Refuses with 404 if the order is missing.
  - Refuses with 409 `DELIVERY_NOT_RELEASABLE` unless the order is `on_hold` with reason `awaiting_stock`, or if a revision claim is lost.
  - Refuses with 422 `DELIVERY_LINES_INVALID` if `checkShipLines` rejects the allocation.
  - If the allocation covers every line's remainder, it only lifts the hold (status recomputed, `holdReason` and `holdNote` unset). No second order is created.
  - Otherwise it shrinks the held order's lines, creates a new fulfillment order for the allocated units, then reports progress and announces the release.
- `withoutAllocated`: returns the held order's lines reduced by the moved quantities, dropping lines that reach zero.
- `allocatedLines`: builds the new order's lines, with `shippedQuantity` and `canceledQuantity` at 0.

## Relationships
- `act.ts` supplies `runActOrThrow` (transaction wrapper), `refuse` and `refuseMissing`.
- `announce.ts` supplies `announceReleased`, which announces the release of the fulfillment order.
- `progress.ts` supplies `reportProgress`, which updates the order's summary. It is called with the order id, once per path.
- `../domain` (`index.ts`, `fulfillment.ts`) supplies the pure helpers `checkShipLines`, `remainingOfLine`, `statusOfLines`, the `FulfillmentLine` and `ProductQuantity` types, and `plainLine`.
- `../repository` supplies `fulfillmentOrderRepository` (`findById`, `findInSession`, `claim`, `findByOrderId`, `create`).
- `../model` supplies the `FulfillmentOrderDocument` type.
- `@modules/orders` (`src/modules/orders/index.ts`) supplies `orderService`, whose `getById` is used to check for cancellation.
- `@types` supplies `FulfillmentHoldReason` and `FulfillmentOrderStatus`.

## Notes
- Updates use optimistic concurrency: `claim` is keyed on `held.revision`. A lost race raises a 409 refusal.
- The caller is a listener, so refusals are thrown (`ActRefusal`), and the outbox retries. A dead event alerts staff.
- The new order gets `number` = max sibling number + 1 and `revision: 0`. It copies `kind`, `agreedAt`, `promisedAt` and `expectedAt` when present, and copies `sourceShipmentId` so a lost parcel that turns up still finds every part that is still owed.
- The held order's status is computed with `statusOfLines(remaining, true)`. The new order's status is computed with `statusOfLines(lines, false)`. The boolean is not explained in this file.
- `allocatedLines` falls back to an empty title if the product is not found on the held order.
- An admin can still hold the new `open` order to ship everything together.
- The cancellation check and the transaction are separate steps, so the order status is read outside the act's session.
