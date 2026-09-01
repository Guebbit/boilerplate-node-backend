# src/modules/orders/tests/integration/service-crud.test.ts

## Purpose

Integration tests for the **write half** of the orders service (`create`, `getById`, `update`, `updateById`, `remove`, `removeById`). The read/aggregation half (`search`) is covered separately in `orders.test.ts`. Two behaviours carry the most weight: `create` embeds a full product snapshot (title + price) rather than a reference, so later repricing cannot rewrite historical orders; and `getById`'s optional `scope` argument is an authorization boundary where a mismatched owner must yield `undefined`, not the order.

## Key elements

- **`seedOrder()`** – Creates a user, two products, and an order through `create`; returns the persisted `OrderDocument` plus fixtures. Used as the shared setup across most suites.
- **`asReject` / `asSuccess`** – Type-narrowing casts for `ResponseReject` and `ResponseSuccess<OrderDocument>` from `@infrastructure/http/response`.
- **`reload(order)`** – Re-fetches the document via `orderRepository.findById` so `update` operates on current state after an external change.
- **`releaseHold(order)`** – Calls `inventoryService.releaseForOrder` to free stock held by the order, needed before `update` can rewrite line items.
- **`describe('create')`** – Verifies 201 response, snapshot embedding (title/price on the line), snapshot immutability after product repricing, line-count preservation, 422 on empty items, 404 on missing product, and all-or-nothing persistence.
- **`describe('getById')`** – Verifies bare-id lookup, `undefined` for missing/empty ids, scope-matching, the scoped-vs-unscoped return-shape divergence, scope-mismatch rejection, and computed totals (`totalItems`, `totalQuantity`, `totalPrice`).
- **`describe('update')`** – Verifies allowed lifecycle transitions, rejection of cancellation-via-status (409 `ORDER_CANCEL_VIA_CANCEL_ENDPOINT`), rejection of disallowed transitions with `details` payload, atomicity (no partial write on failure), rejection of manual `paid` assignment, and refusal to reopen a cancelled order.

## Relationships

- **`@modules/orders/service`** – Primary subject under test; imports `getById`, `create`, `update`, `updateById`, `remove`, `removeById`, `search`, `callerScope`, `orderService`.
- **`@modules/orders` (index / `orderRepository`)** – Used directly for `findById`, `updateStatusIfIn`, `save`, and `count` assertions (bypassing the service to set up pre-conditions like `pending → paid`).
- **`@modules/inventory` (`inventoryService`)** – `releaseForOrder` is called to free held stock before update tests that modify line items.
- **`@modules/products` (`productRepository`)** – Used to mutate a product's price mid-test to verify snapshot immutability.
- **`@modules/products/tests/fixtures`** – `createProduct` seeds catalog items.
- **`@modules/users/tests/fixtures`** – `createUser` seeds buyer and "stranger" accounts.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` resets/injects the MongoDB instance at module load.
- **`tests/support/caller-context.ts`** – `testCallerContext` supplies the actor identity (operator/system) for service calls.
- **`tests/support/stub.ts`** – `asStub<T>` casts Mongoose documents to plain typed objects for property assertions.
- **`@infrastructure/http/response`** – `ResponseReject` / `ResponseSuccess` types used by the local cast helpers.

## Notes

- **Scoped vs. unscoped `getById` return shapes differ.** Unscoped returns a raw Mongoose document keyed by `_id`; scoped returns a transformed plain object keyed by `id`. Because `id` is a Mongoose virtual, both shapes expose `.id`, which makes the divergence easy to miss in application code. This test pins the difference explicitly.
- **Cancellation is a sequence, not a field.** `update` rejects `status: 'cancelled'` (409) because the real path must release inventory and emit `ORDER_CANCELLED` for the payment refund listener. A bare assignment would leave stock held and money unrefunded.
- **`paid` is a system-only transition.** Operators cannot set `status: 'paid'` via `update`; only the `system` actor (e.g., a webhook) may.
- **All-or-nothing on `create`.** If any product in the list is missing, no order document is persisted (`count === 0`), preventing partially-fulfilled charges.
- **`setupTestDb()` runs at module scope** (top-level call), before any `beforeEach`, so the in-memory DB is injected before the first test executes.
- **`asStub` usage** bypasses Mongoose's `Document` typing to allow plain property access (`found.id`, `found._id`) in assertions; this is a test-only pattern, not production code.
