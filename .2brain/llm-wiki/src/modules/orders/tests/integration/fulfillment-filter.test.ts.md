---
source: src/modules/orders/tests/integration/fulfillment-filter.test.ts
source_sha256: 220ae6f7c10ec9589d75a488fc24d7aa6f87c88b30af03dd1a8fcbcd22cc71be
context_sha256: aedc044591124be27faec70e2aa2c40bd77ec846db915b3f2f3de300f72d1013
generated_at: 2026-11-22T06:28:11.471229+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/tests/integration/fulfillment-filter.test.ts

## Purpose
Integration test for `GET /orders?fulfillmentStatus=` run against a real Mongo database. It checks that the filter, which is built from the same table that produces the serialized fulfillment value, selects exactly the orders that report that value and misses none. The pure half of the logic is covered in `src/modules/orders/tests/unit/fulfillment.test.ts`. This file confirms the conditions mean the same thing to the database.

## Key elements
- `setupTestDb()`: called at module level to set up the test database.
- `buyerOrder(status)`: creates a user with a unique email (`buyer-N@example.com`, using the module-level `buyers` counter) and an order with one product item at the given status.
- `orderWith(status, fulfillment?)`: builds on `buyerOrder`. If a partial `FulfillmentSummary` is given, it writes a `fulfillment` object to the order through `orderModel.updateOne`. The defaults are `shipped: false` and zeros for `remaining`, `onHold`, `awaitingStock` and `undelivered`. It returns the order id as a string.
- `listed(fulfillmentStatus)`: calls `orderService.search({ fulfillmentStatus }, {})` and returns the item ids.
- Test cases in `describe('listing by fulfillmentStatus')`:
  - Each of `unfulfilled`, `on_hold`, `in_progress`, `partially_fulfilled`, `shipped` and `fulfilled` selects only its own orders. `unfulfilled` covers the pending and paid orders.
  - `awaiting_shipment` selects paid or processing orders, including partly shipped and held ones. It excludes pending, shipped, and canceled orders, even a canceled order that has `paidAt` set.
  - Each order returned by a filter serializes with a `fulfillmentStatus` equal to the filter value (checked for `on_hold` and `partially_fulfilled`).
  - The filter narrows the caller's scope argument (`{ _id: mine._id }`) rather than replacing it.

## Relationships
- `services` (`orderService`): the code under test, through `search(filter, scope)`.
- `model` (`orderModel`): used to write `fulfillment` and `paidAt` directly onto stored orders.
- `domain` (`FulfillmentSummary` type): the shape of the fulfillment data seeded into orders.
- `@types` (`OrderStatus`, `OrderFulfillmentFilter`): the statuses used to seed orders and the filter values used to query them.
- `orders/tests/factories` (`createOrder`, `toOrderItem`), `users/tests/factories` (`createUser`) and `products/tests/factories` (`createProduct`): create the test data.
- `tests/support/setup-test-db`: provides the database setup.

## Notes
- Each order needs its own buyer account, so `buyerOrder` generates a distinct email for each order.
- The `unfulfilled` and `awaiting_shipment` assertions sort the ids before comparing, so result order doesn't matter.
- Fulfillment summaries are written directly to the model. They are not produced by the delivery flow.
