# src/modules/orders/tests/integration/service-crud.test.ts

## Purpose

Integration tests for the **write/CRUD** half of the orders service (`create`, `getById`, `update`, `updateById`, `remove`, `removeById`). The read/aggregation half (`search`) lives in a sibling `orders.test.ts`. The file pins two load-bearing invariants: (1) `create` embeds a full product snapshot so later repricing cannot rewrite historical charges, and (2) `getById`'s `scope` argument is an authorization boundary where a mismatched scope must return `undefined` indistinguishably from a missing id.

## Key elements

- **`seedOrder()`** — helper that creates a user, two products, and a two-line order through `create`; returns the persisted `OrderDocument` plus its fixture entities.
- **`reload(order)`** — re-reads an order via `orderRepository.findById` so `update` operates on current DB state rather than a stale in-memory doc.
- **`releaseHold(order)`** — calls `inventoryService.releaseForOrder` to free stock an order's lines hold; needed before tests that change line items.
- **`describe('create', …)`** — verifies 201 response, snapshot embedding (title + price on the line), frozen snapshot after product reprice, one-line-per-item, 422 on empty items, 404 on missing product, and all-or-nothing persistence.
- **`describe('getById', …)`** — covers bare-id lookup, missing/empty id, scope-match vs. scope-mismatch (auth boundary), the scoped/unscoped shape divergence (`_id` vs. `id`), and computed totals on the scoped path.
- **`describe('update', …)`** — exercises lifecycle-transition guards: allowed moves succeed, `cancelled` is refused via the status field (409, `ORDER_CANCEL_VIA_CANCEL_ENDPOINT`), disallowed transitions return 409 with `from`/`to`/`allowed` details, rejected updates leave the document untouched, and `paid` is system-only.
- **`asReject` / `asSuccess`** — thin type-cast helpers wrapping `ResponseReject` / `ResponseSuccess<OrderDocument>` from the http response module.

## Relationships

- **`src/modules/orders/service.ts`** — primary subject under test; imports `getById`, `create`, `update`, `updateById`, `remove`, `removeById`, `search`, `callerScope`, `orderService`.
- **`src/modules/orders/repository.ts`** (via `src/modules/orders/index.ts`) — `orderRepository` used for direct state inspection (`findById`, `count`, `updateStatusIfIn`) and for pre-seeding the `paid` status that `update` tests start from.
- **`src/modules/orders/model.ts`** — `OrderDocument` type imported for parameter/return annotations.
- **`src/modules/inventory/service.ts`** (via `src/modules/inventory/index.ts`) — `inventoryService.releaseForOrder` called in `releaseHold` to free stock before line-item changes.
- **`src/modules/products/repository.ts`** (via `src/modules/products/index.ts`) — `productRepository.save` used to reprice a product and verify the order's snapshot is frozen.
- **`src/modules/products/tests/fixtures.ts`** — `createProduct` builds product fixtures.
- **`src/modules/users/tests/fixtures.ts`** — `createUser` builds user fixtures.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` called once at module top level to prepare an isolated database.
- **`tests/support/caller-context.ts`** — `testCallerContext` passed as the caller argument to every service call that accepts one.
- **`tests/support/stub.ts`** — `asStub<T>` used to assert on the shape of scoped vs. unscoped `getById` returns.
- **`src/infrastructure/http/response.ts`** — `ResponseReject` and `ResponseSuccess` types used in the `asReject`/`asSuccess` helpers.

## Notes

- The file explicitly splits CRUD (this file) from `search` (sibling `orders.test.ts`); adding read-aggregation assertions here is a convention violation.
- `getById` has a **shape divergence**: unscoped returns a Mongoose doc keyed by `_id`; scoped returns a plain object keyed by `id`. Both expose a virtual `id`, which makes the divergence easy to miss — the test pins it with explicit `_id` presence/absence assertions.
- `update` tests that start from `paid` bypass `update` itself and use `orderRepository.updateStatusIfIn` to set the prerequisite status, because `pending → paid` is a `system`-only edge.
- The `releaseHold` helper is a prerequisite for any test that modifies line items after creation; omitting it causes `update` to reject with a stock-hold conflict.
- `MISSING_ID` is a fixed, non-existent ObjectId used for negative-existence assertions; it is not a real document.
