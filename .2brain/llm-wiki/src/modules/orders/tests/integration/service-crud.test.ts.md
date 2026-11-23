---
source: src/modules/orders/tests/integration/service-crud.test.ts
source_sha256: 60acf7b100dab37c7b5f43dc96f1ac9cee61974a8f12db612bb55dd69327adc6
context_sha256: 7ca42ab5fbb0a1b1004995c616e2a13a92a8969fa4eda35cab7ea4afc99484d3
generated_at: 2026-11-22T06:33:01.600029+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/tests/integration/service-crud.test.ts

## Purpose
Integration tests for the write half of the orders service (`getById`, `create`, `update`, `updateById`, `remove`, `removeById`), run against a real test database. The search/aggregation half is covered by `service-search.test.ts`. The header calls out two behaviours it treats as load-bearing: `create` stores a product snapshot rather than a reference (later repricing can't change what a customer was charged), and `getById`'s `scope` argument is an authorization boundary (a mismatched scope must return `undefined`, not the order).

## Key elements
- **Setup:** `setupTestDb()` provisions the DB. `@infrastructure/adapters/mailer` is mocked so `enqueueEmail` is a `jest.fn()`. `afterEach` restores mocks and calls `jest.useRealTimers()` so a failing case can't leak a frozen clock.
- **`refusedLines(caller)`:** orders 5 units of a 1-unit product and returns the `details.lines` of the resulting 409. It casts `details.lines` because the error envelope types `details` loosely.
- **`seedOrder()`:** creates a user (`buyer@example.com`), a Keyboard (25.00) and a Mouse (10.00), and places an admin order of 2 keyboards and 1 mouse through `orderService.create`. Returns `{ user, keyboard, mouse, order }`.
- **`seedCanceledOrder()`:** `seedOrder` followed by `forceOrderStatus(..., 'canceled')`, read back the way `removeById` reads it.
- **`createWithLines(quantities)`:** creates one order with one fresh product (`onHand: 100`) per quantity, under a unique buyer email.
- **`describe('create')`:** the visible cases cover:
  - 201 on success.
  - Walk-in orders with no `userId`. These store no account, keep the email, and start `piiClockStartedAt`.
  - Account orders that leave `piiClockStartedAt` unset, because erasure starts the clock there.
  - An admin raising orders for a peer and for themselves.
  - Admin hand-sales of hidden (`active: false`) or off-sale (`purchasable: false`) products, with stock reserved.
  - A soft-deleted product refused with 409 `ORDER_PRODUCT_UNAVAILABLE`, with nothing written and no hold taken.
  - 404 for hidden or soft-deleted products when the caller is a `customer` (lacks `display:Product`).
  - A customer can still buy an off-sale product.
  - `create` skipping the open-order cap that checkout enforces, tested with `NODE_MAX_OPEN_UNPAID_ORDERS_PER_ACCOUNT=1`.

## Relationships
- **Subjects under test:** `orderService` from `@modules/orders/services` (the index), plus the `update` and `remove` functions imported directly from `services/crud` and `services/remove`.
- **`orderRepository`** (`../../repository`) is used to read stored orders and check fields that the service result doesn't expose, such as `userId`, `email` and `piiClockStartedAt`.
- **Factories:** `createUser` (users), `createProduct`, `saveProduct`, `countersOf` (products), and `countOrders`, `createOrder`, `forceOrderStatus`, `toOrderItem` (orders). `countersOf` is used to assert `reserved` stock.
- **Test support (`@tests/*`):**
  - `setup-test-db`
  - `environment`: `withEnvironmentOverrides`
  - `response`: `asSuccess` and `asReject`
  - `callers`: `asCustomer`, `asAdmin`, `callerAs`, `callerContextAs`, `testCallerContext`
  - `ids`: `MISSING_ID`
  - `clock`: `freezeDate`
- **Types:** `OrderStatus` and `CallerContext` come from `@types` (`src/types`).
- **`userService`** is imported from `@modules/users`.

## Notes
- Several comments explain the authorization model:
  - Admin callers may sell hidden or off-sale products by hand.
  - A caller without `display:Product` gets the same 404 for hidden or removed products as for unknown ids, so the response doesn't confirm the product exists.
  - Soft-deleted products are the one thing a hand-raised order still refuses.
- The open-order cap is a checkout rule (`src/modules/cart/services/checkout.ts`), not a `create` rule.
- `createWithLines` uses random-UUID emails because emails are unique and a case may place several orders.
