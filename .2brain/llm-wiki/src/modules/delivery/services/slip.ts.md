---
source: src/modules/delivery/services/slip.ts
source_sha256: 28efe7b38093579ba3caa361668ff225453dcfcc05a51547f80305e6765b00bd
context_sha256: 1d9a5e61a6aadf3525a2f8306e4b67683c1c3ccae06bdb9fec487131cae93eb3
generated_at: 2026-11-22T04:59:22.354381+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/services/slip.ts

## Purpose
Listener logic for moved release or restock dates. When `products` announces `product.release_date_changed` or `product.restock_date_changed`, this file re-evaluates every fulfillment order still waiting on that product, works out the date now expected, and decides what the buyer is owed. A later or cleared date produces a notice (email plus the cancel option). A date that is not later produces no email; the order simply follows the new date. Processing is idempotent because the outbox delivers at least once.

## Key elements
- `onDateChanged(productId, cause)` (exported): loads waiting fulfillment orders via `fulfillmentOrderRepository.findWaitingForProduct`. It then judges each one sequentially, with a separate transaction per order.
- `judgeOne` (internal): runs one order inside `runAct`. It reads the order in the session, computes the new date, calls `judgeMove(order, next, shopTimezone())`, and applies the verdict. It returns the `SentNotice` to be mailed after commit, or `undefined` if there is no order, no verdict, or the act was refused.
- `expectedFrom` (internal): reads the product dates from the catalogue, not from the event. It uses `expectedDateOfWaiting` with `releaseDate` for preorders and `restockDate` for backorders. This keeps multi-product groups correct when one product moves earlier.
- `apply` (internal): applies a `SlipVerdict`.
  - `earlier`: if the new date differs from `expectedAt`, it claims the order (optimistic, using `revision`) with the new `expectedAt` and records the date move. It sends no notice.
  - Any other verdict: records the date move, then calls `recordNotice` with reason `moved`. If `recordNotice` returns nothing, it refuses with 409 `DELIVERY_NOT_SHIPPABLE`.
- `recordDateMoved` (internal): appends a `release_date_moved` timeline entry, with `from` and `to` as shop days. A missing date on either side means the key is omitted.

## Relationships
- `../domain` (`index.ts`, `preorder.ts`): supplies the pure decision logic (`judgeMove`, `expectedDateOfWaiting`) and the types `SlipVerdict` and `WaitCause`. `fulfillment.ts` is also a neighbor.
- `../repository`: `fulfillmentOrderRepository` provides `findWaitingForProduct`, `findInSession`, and `claim`.
- `../model`: provides the `FulfillmentOrderDocument` type.
- `./act`: provides `runAct`, which is the transaction wrapper, and `refuse`.
- `./notice`: provides `recordNotice` and the `SentNotice` type.
- `@modules/products` (`src/modules/products/index.ts`): its `productService` supplies the current product dates.
- `@modules/orders` (`src/modules/orders/index.ts`): its `orderService` writes the timeline entry.
- `@modules/shop` (`src/modules/shop/index.ts`): provides `shopDayOf` and `shopTimezone`.
- `reship.test.ts` appears among the graph neighbors, but this file does not reference it.

## Notes
- The move timeline row must be written before the notice row. The timeline sorts by time and then id, and the notice stamps its own row at write time, so a same-millisecond tie must put the move first.
- Delivery writes the timeline entry because `orders` cannot listen to the `products` event itself: `products` is imported by `orders`.
- When `claim` loses a race (a ship or allocation won), the `earlier` branch silently skips the timeline row. In the notice branch, the refusal rolls back the move row together with the act.
- Redelivered events do nothing, because the order already holds the new date. For a cleared date, no expected date is left to change.
- The email is sent after the transaction commits, from the returned `SentNotice`.
