---
source: src/modules/orders/tests/integration/remove-race.test.ts
source_sha256: 587cd58cfb338cbed012a32d218ac4cd5bd5ec999a2759a01730e98f15ac3cda
context_sha256: 9407c8169de1d983d0e68a19bdf25e3cb5ba2cebb09af77ce4f6e948ebafb5f2
generated_at: 2026-11-22T06:31:50.362542+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/tests/integration/remove-race.test.ts

## Purpose
Integration test (real Mongo) for the hard-delete service `remove`. It verifies that a change committing after `remove` has read `status` and `paidAt` from the order it was handed (a settlement, a reopen, or a concurrent delete) still stops the delete. The write itself is conditional on the order being canceled and unpaid, and a miss is answered from a fresh read.

## Key elements
- `setupTestDb()`: called at module level to set up the test database.
- `canceledOrder()`: local helper. It creates a user, a product (`onHand: 10`) and an order with one item (quantity 3) in `canceled` status. It then re-reads the order with `readOrder`, the way `removeById` does, and returns `{ order, orderId }`. It throws `'order vanished'` if the read returns nothing.
- Test suite `remove: a hard delete`, with four cases:
  - **Settlement race:** `markOrderPaidAt` runs after the read, so `remove(order, true)` returns 409 `ORDER_INVOICED` and the order still exists.
  - **Reopen race:** `forceOrderStatus(orderId, 'pending')` makes it return 409 `ORDER_NOT_CANCELED`, and the order still exists.
  - **Concurrent delete:** the order is removed first, then `remove` is called with the stale copy. It returns 404.
  - **Happy path:** a canceled, unpaid order is deleted. `result.success` is true and a subsequent `readOrder` finds no order.

## Relationships
- `../../services/remove`: the unit under test. It is always called as `remove(order, true)` with a stale in-memory order document.
- `@modules/orders/tests/factories`: supplies `createOrder`, `toOrderItem`, `forceOrderStatus`, `markOrderPaidAt` and `readOrder`. The last three are used to change or inspect DB state behind the stale copy.
- `@modules/users/tests/factories` (`createUser`) and `@modules/products/tests/factories` (`createProduct`): provide the fixtures for the order.
- `@tests/response` (`asReject`): narrows the result to a rejection so `status` and `errors[0].code` can be asserted.
- `@tests/setup-test-db`: provides the `setupTestDb` lifecycle.

## Notes
- The race is simulated deterministically. The stale `order` is read first, then the DB is mutated directly, then `remove` is called. No real concurrency is involved.
- The second argument `true` passed to `remove` is not explained in this file.
