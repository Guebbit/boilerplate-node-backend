---
source: src/modules/delivery/tests/integration/preorder-board.test.ts
sha256: 6c46bd0d600575490719b41302a7e4e235c148f8ea97af0b218c746f1504b061
generated_at: 2026-10-14T15:36:45.474831+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/integration/preorder-board.test.ts

## Purpose
Integration test for the preorder board's read queries. Verifies that every state filter (`waiting`, `awaiting_yes`, `allocated`, `shipped`, `cancelled`) returns exactly the rows whose own `state` field matches, that the Late view and due-soon warning surface the correct rows, that the product summary totals reconcile with what was paid, and that row visibility respects caller identity. It exists to keep the Mongo filter conditions and `boardStateOf` in lockstep.

## Key elements
- **`placed(quantity, days, buyer?)`** — creates one paid preorder order plus its fulfillment orders via `paidPreorderOrder` / `fulfillmentOrdersOf`.
- **`arrive(productId, quantity)`** — receives inventory and flushes outbox nudges so allocation reaches delivery.
- **`board(query?, now?)`** — shorthand for calling `listPreorderFulfillmentOrders` as an admin and returning `items`.
- **`everyState()`** — creates seven orders (one per lifecycle state) and advances them to their target states in one setup call.
- **`slipFar(productId)`** — pushes a product's `releaseDate` to +90 days and settles outbox, simulating a buyer-confirmed date change.
- **`describe('every state filter…')`** — asserts filter-by-state matches row state for all five states; also distinguishes `shipped` with `delivered: true` vs `false`.
- **`describe('the Late view…')`** — checks `late: true` and `dueWithin: N` queries, and that `slippedDays` reports the whole-day delta.
- **`describe('the product summary')`** — validates `summarizePreorders` unit counts and that per-state columns sum to `paid`; also covers `awaitingYes` as a separate bucket and `late` as a subset.
- **`describe('who may read which rows')`** — buyer sees only own rows, admin sees all, unauthenticated caller sees none (both list and summary).
- **`beforeEach`** — resets domain events, re-subscribes `deliveryModule`, and marks events wired.
- **Mailer mock** — `@infrastructure/adapters/mailer` is replaced with a no-op `enqueueEmail`.

## Relationships
- **`@modules/delivery/services`** (board, cancel-remainder, holds, preorder-sweep) — the system under test; this file exercises `listPreorderFulfillmentOrders`, `summarizePreorders`, `cancelAllForOrder`, `holdFulfillmentOrder`, and `runPreorderSweep`.
- **`@modules/delivery/module.ts`** — subscribed in `beforeEach` so domain-event handlers fire during setup (e.g., allocation triggers).
- **`@kernel/events.ts`** — `markDomainEventsWired` / `resetDomainEvents` gate and clean up the event bus per test.
- **`@kernel/outbox.ts`** — `settleOutboxNudges` drains the outbox so side-effects (allocation, date-change nudges) complete synchronously.
- **`@modules/delivery/tests/factories.ts`** — provides `paidPreorderOrder`, `fulfillmentOrdersOf`, `shipEverything`, `deliverEverything`.
- **`@modules/orders/tests/factories.ts`** — `forceOrderStatus` pushes an order to `processing` so shipping/delivery can proceed.
- **`@modules/inventory`** — `inventoryService.receive` triggers the allocation pipeline.
- **`@modules/products`** — `productService.updateById` changes `releaseDate` to drive the late/slip assertions.
- **`@types`** — `OrderStatus` enum used when forcing order state.

## Notes
- The test relies on `setupTestDb()` (a real Mongo instance) — it is a true integration test, not a unit test.
- `settleOutboxNudges()` must be called after any write that enqueues an outbox entry (inventory receive, product date change) before asserting board state; forgetting it leaves allocation unprocessed.
- The `everyState` helper allocates all seven orders against **different** products, so inventory receipt per product is independent; do not reuse a product across helper orders without adjusting the arrive quantities.
- `board({ state })` accepts a `now` parameter only for the late/due-within queries; state filters ignore it.
- The mailer mock prevents real email side-effects from date-slip nudges (`slipFar`).
