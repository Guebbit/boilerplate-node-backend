---
source: src/modules/delivery/tests/integration/preorder.test.ts
sha256: 86357783580486f7f561eca61b43a4bc55568e615d82d9eb319044d42b1f0f07
generated_at: 2026-10-14T15:37:47.354545+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/integration/preorder.test.ts

## Purpose

Integration tests for the paid-preorder delivery flow. They verify that the grouping rule reads the release date the order *frozen* (not the live catalogue), that fulfillment orders start `on_hold / awaiting_stock`, and that stock arriving through the outbox releases the hold — either in one shot or by splitting the order when the delivery is short. The tests use a real inventory service and a real outbox so the seam between the two modules is exercised end-to-end.

## Key elements

- **`inDays(days)`** – Helper that returns a `Date` `days` in the future; used to build release dates.
- **`receiveAndSettle(productId, quantity)`** – Calls `inventoryService.receive` then `settleOutboxNudges`, simulating a stock arrival that flows through the outbox.
- **`describe('grouping a paid preorder')`** – Two tests: the fulfillment order holds the buyer's promised date; mutating the catalogue's release date afterwards does not change the hold.
- **`describe('stock arriving for a paid preorder')`** – Five tests covering:
  - Full release (delivery covers the whole line → single `open` order).
  - Split delivery (short delivery → two orders, one `on_hold`, one `open`; the new order inherits `agreedAt`).
  - Lazy creation: if the paid-listener never fired, `fulfillmentOrdersOf` still materializes the orders on first read.
  - Idempotency: calling `releaseAllocated` twice for the same allocation produces no extra split.
  - Earliest-promise-first: one product at two release dates opens the earlier date first.

## Relationships

- **`@modules/delivery/tests/factories`** – `paidPreorderOrder` sets up a paid preorder order; `fulfillmentOrdersOf` triggers the grouping rule and returns the resulting fulfillment orders.
- **`@modules/delivery/module`** – `deliveryModule.subscribe()` is called in `beforeEach` so the delivery listeners are wired before each test.
- **`@modules/delivery/services`** (re-exports `releaseAllocated`) – called directly in the idempotency test to announce a release out-of-band.
- **`@kernel/events`** – `resetDomainEvents` / `markDomainEventsWired` manage the in-memory event bus lifecycle around each test.
- **`@kernel/outbox`** – `settleOutboxNudges` drains the outbox so the delivery module's release logic actually runs.
- **`@modules/inventory`** – `inventoryService` provides `receive`, `setPreorderLimit`, `reserveForOrder`, `commitForOrder` to simulate stock arriving and allocation.
- **`@modules/orders`** – `orderService.getById` reads back the persisted order to assert `fulfillment` counters; `createOrder` / `toOrderItem` build test orders.
- **`@modules/products`** – `productService.updateById` mutates the catalogue (to prove the frozen date wins); `createProduct` builds test products.
- **`@modules/users/tests/factories`** – `createUser` creates the buyer for the two-date test.

## Notes

- The "paid listener never ran" test reveals that `fulfillmentOrdersOf` is **lazy**: if the delivery module's paid-order listener was never triggered, the first call to the factory still materializes the fulfillment orders. This is a deliberate safety net, not a bug.
- Split delivery produces **two** fulfillment orders with sequential numbers (1 = still holding, 2 = opened). The new order copies `agreedAt` from the original so downstream "Late" views and notifications still see the correct promise.
- The test suite relies on the outbox as the **only** communication channel between inventory and delivery. There is no direct call from `inventoryService.receive` to delivery logic; `settleOutboxNudges` is what makes the release happen.
