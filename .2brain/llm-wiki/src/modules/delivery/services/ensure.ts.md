---
source: src/modules/delivery/services/ensure.ts
source_sha256: 230e048d431c60a9c490e22f87c6e036fb16fa2e0b1b78ac215657066c3430d7
context_sha256: 835b713b00da32ee6f8dbbaff183e55c9818bd1d757d92b430d132b6786bf7a1
generated_at: 2026-11-22T04:54:28.664066+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/services/ensure.ts

## Purpose
Creates an order's fulfillment orders when the order is paid. The `paid` event listener is the normal path, but the same idempotent create is exported as `ensureFulfillmentOrders` so other flows can run it too: `start`, a preorder allocation, and an operator reviving a dead `paid` event (the outbox gives up after its last retry). A read never creates them.

## Key elements
- `ensureFulfillmentOrders(orderId)`: the only export. In one transaction it creates the order's fulfillment orders if it has none yet, then reports progress. It resolves to `void`.
  - It returns without doing anything if the order is missing or its status is not `isAwaitingGoods`, or if fulfillment orders already exist for the order.
  - It groups the lines with `groupOrderLines(..., shopTimezone())`.
  - It inserts each draft with `fulfillmentOrderRepository.insertIfAbsent`, one after another, because a transaction session does not take parallel operations.
  - When a draft is newly inserted and has a `holdReason` (a preorder group), it appends a `fulfillment_held` timeline entry to the order.
  - It then calls `reportProgress(orderId, session)`.
- `groupableLinesOf(order)`: internal helper that maps `order.items` to `GroupableLine[]`.
  - It reads the snapshot frozen at checkout: `ships` comes from `isShippedItem`, and `noWithdrawal`, `preorder`, `releaseDate` and the backorder info (`quantity`, `promisedAt`, `dated`) are included only when present.
  - Backorder info is included only when the item has both `backorderedQuantity` and `promisedAt`.

## Relationships
- **Orders module** (`@modules/orders`): loads the order and writes the hold timeline entry through its order service, and `isShippedItem` and `isAwaitingGoods` classify the lines and the status. `OrderDocument` is the order type.
- **Shop module** (`@modules/shop`): `shopTimezone()` is passed to the grouping rule.
- **Delivery domain** (`../domain`): `groupOrderLines` and `GroupableLine` define the grouping rule and its input shape.
- **Delivery repository** (`../repository`): `fulfillmentOrderRepository` is used for the existence check and for the writes (`insertIfAbsent`).
- **`./act`**: `ActRefusal` is the error caught to detect a canceled order.
- **`./progress`**: `reportProgress` is called inside the same transaction to report the summary.
- **`@infrastructure/runtime/database`**: `withTransaction` provides the session.

## Notes
- **Idempotency:** it is keyed on `{ orderId, number }`. A retried listener, or `start` running after the listener, leaves exactly one set.
- **Frozen line data:** preorder flag and release date come from the line snapshot, not the current product, because a bank transfer can be paid a week after it was ordered.
- **Cancel race:** an `ActRefusal` thrown inside the transaction means the order was canceled after it was read. The transaction rolls back and the error is swallowed, so the function resolves normally. This is deliberate. A failing `paid` listener would hold up every later event of the order, including the cancel's refund.
- **Other errors:** any other error is rethrown.
- **Check-then-write:** the existence check runs outside the transaction. Duplicate prevention at write time relies on `insertIfAbsent`.
