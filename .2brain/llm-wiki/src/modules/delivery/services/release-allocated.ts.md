---
source: src/modules/delivery/services/release-allocated.ts
source_sha256: 33f7eb8c8c67dfd5f8e95a1f69d7e196472be028ea1be187933ee8c279dbb304
context_sha256: 4e99aa27bd9f764814d253396058849c0f9d36342c1660306b763b57b318fa40
generated_at: 2026-11-22T04:58:02.460339+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/services/release-allocated.ts

## Purpose
Listener logic that lets a paid preorder's fulfillment orders go when stock arrives. `inventory` allocates a receipt to paid preorders (oldest payment first) and announces what each order still waits for; `releaseAllocated` moves the matching units out of `awaiting_stock` by calling `splitForAllocation`. The event carries a state (`waiting`), not a delta, so the handler is idempotent: it releases only what is held beyond `waiting`, and a redelivery finds nothing to release.

## Key elements
- `releaseAllocated(orderId, productId, waiting)` (exported): ensures the order's fulfillment orders exist, finds the held ones for the product, computes `toRelease = total waiting units − waiting`, then splits sequentially until that amount is released.
- `heldFor(orderId, productId)` (internal): loads the order's fulfillment orders and keeps those that are `on_hold` with hold reason `awaiting_stock` and still waiting on the product. They are sorted by `agreedAt` (earliest promise first), then by `number`.
- `waitingOn(fulfillmentOrder, productId)` (internal): sums `remainingOfLine` over the lines of that product.

## Relationships
- `./ensure` (`src/modules/delivery/services/ensure.ts`): `ensureFulfillmentOrders` is called first, because the paid listener may not have created the fulfillment orders yet (same idempotent create).
- `./split` (`src/modules/delivery/services/split.ts`): `splitForAllocation(id, [{ productId, quantity }])` does the actual release of units out of `awaiting_stock`.
- `../repository` (`src/modules/delivery/repository.ts`): `fulfillmentOrderRepository` supplies the order's fulfillment orders (looked up by order id).
- `../domain` (`src/modules/delivery/domain/index.ts`): `remainingOfLine` computes the units per line.
- `../model` (`src/modules/delivery/model.ts`): provides the `FulfillmentOrderDocument` type.
- `@types` (`src/types/index.ts`): provides the `FulfillmentOrderStatus` and `FulfillmentHoldReason` enums.
- Tests: `src/modules/delivery/tests/unit/fulfillment.test.ts` and `tests/contract/ownership-shop.contract.test.ts` are related in the graph. The file content does not show how they use it.

## Notes
- Splits run one after another (`await` in a loop), because each split rewrites the same order's summary.
- If a split is refused (`ActRefusal`, i.e. it lost a race), the error propagates. The outbox retries the event, and the retry recounts what is still held and releases only the remainder.
- The module doc comment points to a documentation section, `#a-short-stock-delivery` in the delivery module docs.
