---
source: src/modules/delivery/services/ensure.ts
sha256: e3c4971012066d045a8e487bef4bb0cc2b62bb8ca1bb1e2520d941f90b06ab62
generated_at: 2026-10-29T03:39:33.049728+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/ensure.ts

## Purpose

Guarantees that a paid order has its fulfillment orders created. The normal creation path is the `paid` outbox listener, but this function re-runs the same idempotent create on every read and `start` of a paid order as a safety net—because the outbox stops retrying after its last attempt, and a missing fulfillment order would leave the order with no ship door.

## Key elements

- **`ensureFulfillmentOrders(orderId)`** (exported) — Loads the order, checks it is awaiting goods, then verifies no fulfillment orders already exist. If none do, groups the order's lines and inserts the drafts one-by-one inside a single database transaction, appending a `fulfillment_held` timeline entry for any preorder group born on hold, and finally reports progress. Returns `undefined` (no-op) for missing, unpaid, cancelled, or already-dispatched orders.
- **`groupableLinesOf(order)`** (internal) — Maps order items to the `GroupableLine` shape expected by `groupOrderLines`. Reads `preorder`, `releaseDate`, `noWithdrawal`, and backorder data from the **frozen checkout snapshot**, never from live product data.

## Relationships

- **`src/modules/orders/index.ts` / `src/modules/orders/services/index.ts`** — Consumes `orderService.getById`, `orderService.appendTimeline`, `isShippedItem`, and `isAwaitingGoods`.
- **`src/modules/orders/model.ts`** — Uses the `OrderDocument` type for its input parameter.
- **`src/modules/orders/domain/lifecycle.ts`** — Provides `isAwaitingGoods` (status guard before creating).
- **`src/modules/delivery/domain/index.ts` / `fulfillment.ts`** — Uses `groupOrderLines` and the `GroupableLine` type to partition order lines into fulfillment-order drafts.
- **`src/modules/delivery/repository.ts`** — Calls `fulfillmentOrderRepository.findByOrderId` (existence check) and `fulfillmentOrderRepository.insertIfAbsent` (idempotent insert per draft).
- **`src/infrastructure/runtime/database.ts`** — Wraps the insert + timeline + progress sequence in `withTransaction`.
- **`src/modules/delivery/services/act.ts`** — Catches `ActRefusal` to treat a concurrent cancellation (read-then-cancel race) as a silent no-op rather than a failure.
- **`src/modules/delivery/services/progress.ts`** — Calls `reportProgress` at the end of the transaction to update the order's shipping progress.
- **`src/modules/delivery/services/index.ts`** — Barrel that re-exports `ensureFulfillmentOrders` to callers such as `read.ts` and `process.ts`.

## Notes

- **Frozen snapshot, not live product.** `groupableLinesOf` deliberately reads `preorder`, `releaseDate`, and `noWithdrawal` from the item's embedded `product` snapshot. A bank-transfer order can be paid weeks after checkout; live product data may have changed.
- **Sequential inserts by design.** The `for…of` loop inside the transaction is intentional—`withTransaction`'s session does not support parallel operations.
- **`ActRefusal` is swallowed, not re-thrown.** If the order is cancelled between the initial read and the insert, the transaction rolls back and the function resolves to `undefined`. This is intentional: a failing `paid` listener would block every subsequent event on the order, including the cancellation's own refund.
- **Idempotency key is `{ orderId, number }`.** `insertIfAbsent` ensures a retried listener, a concurrent read, or a late safety-net run all produce exactly one set of fulfillment orders.
