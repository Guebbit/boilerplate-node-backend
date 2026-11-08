---
source: src/modules/delivery/services/ensure.ts
sha256: 624937ec68c87f45a981125459059b413d85acd059811a4374d281c519738c69
generated_at: 2026-11-08T05:35:18.192104+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/ensure.ts

## Purpose

Creates fulfillment orders for a paid order, idempotently. It is both the normal creation path (triggered by the `paid` event listener) and a safety net re-run on every read and `start` of a paid order, because the outbox gives up after its last retry and a missing fulfillment order would leave no ship door at all.

## Key elements

- **`ensureFulfillmentOrders(orderId)`** — Exported. Fetches the order, skips if missing / not awaiting goods / canceled / past dispatch / already has fulfillment orders. Otherwise groups the order's lines and inserts fulfillment orders via `insertIfAbsent` (idempotent on `{ orderId, number }`), then reports progress — all in one transaction. Swallows `ActRefusal` (order canceled between read and write) so a failed `paid` listener does not block later events (e.g. the cancel's refund).
- **`groupableLinesOf(order)`** — Internal. Maps order items to `GroupableLine[]` using the **frozen** checkout snapshot: `ships`, `noWithdrawal`, `preorder`, `releaseDate`, and backorder details (`quantity`, `promisedAt`, `dated`).

## Relationships

- **`src/modules/orders/index.ts`** — Imports `orderService` (getById, appendTimeline), `isShippedItem`, `isAwaitingGoods`, and the `OrderDocument` type.
- **`src/modules/delivery/domain/index.ts`** — Imports `groupOrderLines` and the `GroupableLine` type used to split order lines into fulfillment-order drafts.
- **`src/modules/delivery/repository.ts`** — Uses `fulfillmentOrderRepository.findByOrderId` (existence check) and `insertIfAbsent` (idempotent write) within the transaction.
- **`src/infrastructure/runtime/database.ts`** — Uses `withTransaction` to make the multi-insert + timeline-append + progress-report atomic.
- **`src/modules/delivery/services/act.ts`** — Imports `ActRefusal`; if the order was canceled between the read and the write, this error is caught and the no-op is treated as success.
- **`src/modules/delivery/services/progress.ts`** — Calls `reportProgress(orderId, session)` after inserts to update the order's fulfillment progress.

## Notes

- **Frozen snapshot, not live product.** `preorder`, `releaseDate`, and `noWithdrawal` are read from the item's product snapshot at checkout, because a bank transfer can be paid a week or more after ordering. Do not "fix" this to read the current product.
- **Sequential inserts by design.** The transaction session does not accept parallel operations, so the for-loop awaits each `insertIfAbsent` in order.
- **`ActRefusal` is not a failure.** A canceled order that races the write causes the transaction to roll back; this is intentional and must not be surfaced as an error, or it would poison the event stream for that order.
- **Preorder hold annotation.** If a draft carries a `holdReason` (e.g. preorder), a single `fulfillment_held` timeline entry is appended to the order in the same transaction so staff see the hold without a separate write.
