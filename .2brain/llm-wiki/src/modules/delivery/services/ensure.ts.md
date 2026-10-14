---
source: src/modules/delivery/services/ensure.ts
sha256: 63c29bbc522590e7533cafafe96ab7f155953564e2b42fae1a0c70790628a4da
generated_at: 2026-10-14T15:29:12.598090+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/ensure.ts

## Purpose

Creates fulfillment orders for a paid order, idempotently. It is the safety-net re-run of the same create logic that the `paid` event listener performs: because the outbox drops after its last retry, a missing fulfillment order would leave the order with no ship door at all. This file re-attempts the create on every read and `start` of a paid order, so the gap self-heals.

## Key elements

- **`ensureFulfillmentOrders(orderId)`** (exported) — The sole public entry point. Loads the order, checks it is in a fulfillable status, verifies no fulfillment orders already exist, groups its lines, and inserts them inside a single `withTransaction`. Idempotent via `insertIfAbsent` on `{ orderId, number }`. Also appends a `fulfillment_held` timeline entry once per preorder group and calls `reportProgress`.
- **`groupableLinesOf(order)`** (module-private) — Maps an `OrderDocument`'s items into `GroupableLine[]` shapes for the grouping rule. Reads `preorder` and `releaseDate` from the frozen checkout snapshot, not from the live product.
- **`FULFILLABLE`** (module-private) — A `ReadonlySet` of `OrderStatus.paid` and `OrderStatus.processing`. Any other status (shipped, delivered, cancelled, etc.) causes an early no-op.

## Relationships

- **`src/modules/orders/index.ts`** — Imports `orderService` (getById, appendTimeline) and `isShippedItem`; imports the `OrderDocument` type from `src/modules/orders/model.ts`.
- **`src/infrastructure/runtime/database.ts`** — Imports `withTransaction` to batch all inserts and the timeline write atomically.
- **`src/modules/delivery/domain/index.ts`** (re-exports from `domain/fulfillment.ts`) — Imports `groupOrderLines` and the `GroupableLine` type for line grouping.
- **`src/modules/delivery/repository.ts`** — Imports `fulfillmentOrderRepository` for `findByOrderId` and `insertIfAbsent`.
- **`src/modules/delivery/services/progress.ts`** — Imports `reportProgress` to refresh the order's progress summary after creation.
- **`src/modules/delivery/services/read.ts`** and **`src/modules/delivery/services/start.ts`** — Both call `ensureFulfillmentOrders` as a safety net on their respective paths (read of a paid order, start of a paid order), per the module doc comment.

## Notes

- The transaction body inserts drafts **sequentially** (`for…of` + `await`), not in parallel, because a single session does not support concurrent operations.
- `insertIfAbsent` is the idempotency guard: a retried listener, a concurrent read, or the safety net all converge to exactly one set of fulfillment orders.
- Preorder hold is recorded **inside** the transaction (same session), so the timeline entry and the insert are atomic.
- `groupableLinesOf` deliberately reads `preorder`/`releaseDate` from the item snapshot, not the current product, because payment can lag order by an arbitrary interval (e.g., bank transfer a week later).
