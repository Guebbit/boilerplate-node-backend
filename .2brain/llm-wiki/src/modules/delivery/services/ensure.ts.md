---
source: src/modules/delivery/services/ensure.ts
sha256: 11ed03101a21c7c10857465dea348a320900307541209054ed12be7e4c19ccf8
generated_at: 2026-11-14T19:46:03.781937+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/ensure.ts

## Purpose
Creates an order's fulfillment orders idempotently once the order is paid. The `paid` event listener is the normal trigger, but the same `ensureFulfillmentOrders` call is also made by `start`, by a preorder allocation, and by an operator reviving a dead `paid` event after the outbox exhausts its retries. A read path never creates them.

## Key elements
- **`groupableLinesOf`** (module-private) — Maps an `OrderDocument`'s items to `GroupableLine[]` for the grouping rule. Reads preorder, release-date, backorder, and no-withdrawal flags from the **frozen** product snapshot on the line, not from the live product.
- **`ensureFulfillmentOrders(orderId)`** (exported) — The single public entry point. Checks the order exists and passes `isAwaitingGoods`, verifies no fulfillment orders already exist, groups the lines via `groupOrderLines`, then inserts each draft with `fulfillmentOrderRepository.insertIfAbsent` inside one transaction. Appends a `fulfillment_held` timeline event for any draft born on hold (preorder). Calls `reportProgress` at the end. Swallows `ActRefusal` (order canceled between read and write) so the `paid` listener does not poison subsequent events.

## Relationships
- **`src/infrastructure/runtime/database.ts`** — `withTransaction` wraps all inserts and the progress report in a single atomic unit.
- **`src/modules/delivery/domain/index.ts`** / **`src/modules/delivery/domain/fulfillment.ts`** — Provides `groupOrderLines` and the `GroupableLine` type used to split one order into one or more fulfillment orders.
- **`src/modules/delivery/repository.ts`** — `fulfillmentOrderRepository` supplies the existence check and the idempotent `insertIfAbsent` (keyed on `{orderId, number}`).
- **`src/modules/delivery/services/act.ts`** — `ActRefusal` is caught to distinguish a legitimate cancellation (rollback, not an error) from a real failure.
- **`src/modules/delivery/services/progress.ts`** — `reportProgress` is called after all inserts to update the order's fulfillment progress.
- **`src/modules/orders/index.ts`** — `orderService.getById`, `orderService.appendTimeline`, `isShippedItem`, `isAwaitingGoods`, and the `OrderDocument` type.
- **`src/modules/orders/domain/lifecycle.ts`** / **`src/modules/orders/domain/rules.ts`** / **`src/modules/orders/model.ts`** — Underlying order status predicates and item shapes consumed via the imports above.
- **`src/modules/orders/services/index.ts`** — Re-export surface for the order service used in the lookup and timeline calls.
- **`src/modules/shop/index.ts`** — `shopTimezone()` is passed to `groupOrderLines` so date-based grouping (release dates) uses the shop's local day boundary.

## Notes
- **Frozen-snapshot reads:** Preorder flag, release date, and backorder details are always read from the line's product copy captured at checkout. A bank transfer may be paid days or weeks later; the live product could have changed.
- **Sequential inserts:** The transaction session does not support parallel operations, so drafts are inserted one after another in a `for…of` loop.
- **Idempotency key is `{orderId, number}`:** A retried listener or a `start` that runs after the listener will not produce a second set.
- **Cancellation is not a failure:** If the order is canceled between the existence check and the insert, the transaction rolls back and the function resolves normally. This prevents a stuck `paid` listener from blocking every later event (including the cancel's refund).
- **Preorder hold:** A draft whose `holdReason` is set (preorder group) gets a one-time `fulfillment_held` timeline entry so staff can see why it is on hold.
