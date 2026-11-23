---
source: src/modules/delivery/services/owed.ts
source_sha256: 6e9189070aa6564756434bbcfc0473bc7b133c3575a2498214e7c4f09f6d18e1
context_sha256: 92ef46ea216d252268ad614c776f47cf9710493835617abbbc258502bbdb8f3c
generated_at: 2026-11-22T04:56:49.875456+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/services/owed.ts

## Purpose
Handles the part of a re-send that stock on the shelf cannot cover: units the shop owes the buyer again (a lost parcel, or a replacement under the guarantee). These units wait on a new fulfillment order that is on hold for stock, promised for the restock date, and outside the backorder cap. The module comment points to a "lost-in-transit" section of the delivery module docs.

## Key elements
- `Owed`: interface `{ productId, quantity }` for one re-sent line.
- `OwedOrigin`: interface describing where the owed units come from: `orderId`, `titleOf(productId)` (the title the line carried when it first shipped), and an optional `sourceShipmentId` (the lost shipment; absent for a replacement).
- `promiseFor(owed, now)`: looks up the products and returns an `OwedDate` via `owedDateOf`, using each product's `restockDate`, `now`, and `BACKORDER_PROMISE_DAYS`.
- `createOwedFulfillmentOrder(origin, owed, promise, session)`: inside the caller's transaction, creates the fulfillment order that waits for the owed units:
  - Number is one more than the highest `number` among the order's existing fulfillment orders.
  - Kind is `physical`, with `holdReason: awaiting_stock` and `cause: 'backorder'`.
  - Lines start with `shippedQuantity` and `canceledQuantity` at 0, and the status comes from `statusOfLines(lines, true)`.
  - `agreedAt`, `promisedAt` and `expectedAt` are all set to `promise.at`. `defaulted: true` is added only if the promise was defaulted.
  - `sourceShipmentId` is added only for a lost parcel, so the parcel turning up can close the order.
  - `revision` starts at 0.

## Relationships
- `../domain` (`index.ts`): supplies `owedDateOf`, `statusOfLines` and the `OwedDate` type.
- `../repository`: provides `fulfillmentOrderRepository`, used to read the order's existing fulfillment orders and to persist the new one, both given the session.
- `../model`: provides the `FulfillmentOrderDocument` return type.
- `@modules/products` (`src/modules/products/index.ts`): provides `productService`, used to fetch products for their restock dates.
- `@modules/shop`: `BACKORDER_PROMISE_DAYS`, the default promise window.
- `@types`: `FulfillmentHoldReason` and `FulfillmentOrderKind` enums.
- Sibling services `lost.ts` and `reship.ts` are neighbors in the graph, but this file does not import them.

## Notes
- `createOwedFulfillmentOrder` computes the new order number with `Math.max(...siblings.map(...)) + 1`. This relies on at least one existing fulfillment order for the order, because with none it yields `NaN`.
- Both functions leave transaction and timing control to the caller: the session and `now` are passed in.
