# src/modules/orders/tests/integration/service-search.test.ts

## Purpose

Integration tests for `orderService.search`, verifying that the derived fields (`totalItems`, `totalQuantity`, `totalPrice`) are present on every result and that all filter, pagination, and scope parameters work correctly against a real database.

## Key elements

- **`OrderWithTotals`** — local type alias extending `OrderDocument` with the three computed fields; used to type-cast `result.items` in assertions.
- **`describe('orderService.search — derived totals')`** — four tests asserting that `totalItems` (distinct product lines), `totalQuantity` (sum of quantities), and `totalPrice` (Σ price × qty) are present and correct, including a multi-product composite case.
- **`describe('orderService.search')`** — tests covering default pagination, filtering by `userId` / `email` / `id` / `productId` (embedded doc), `page`/`pageSize` pagination, computed-field presence in the general path, a raw Mongoose `scope` filter (second argument), and the empty-result edge case.

## Relationships

- **`src/modules/orders/service.ts`** — the module under test; calls `orderService.search(params?, scope?)`.
- **`src/modules/orders/index.ts`** — provides the `OrderDocument` type imported at the top.
- **`src/modules/orders/model.ts`** — not imported directly, but the tests guard behavior defined here (`applyOrderTransform` / schema `toJSON` / repository `normalize`) that populates the derived fields.
- **`src/modules/orders/tests/factory.ts`** — supplies `createOrder` and `toOrderItem` test-data helpers.
- **`src/modules/products/tests/factory.ts`** — supplies `createProduct`.
- **`src/modules/users/tests/factory.ts`** — supplies `createUser`.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module scope to seed/clean the test database before any test runs.

## Notes

- The leading comment block explains the *why*: `.aggregate()` bypasses Mongoose's `toJSON` transform, so the only mechanism that attaches the derived fields to a result is the repository's `normalize` step. These tests exist to catch regressions in that pipeline.
- `setupTestDb()` is invoked at the top level of the module (not inside a `beforeAll` hook), so it runs once when the file is loaded by the test runner.
- The second argument to `search` (`scope`) is a raw Mongoose filter object merged into the `$match` stage — distinct from the `params` object which uses the service's own filter keys (`userId`, `email`, `id`, `productId`).
- Independent entity creation (e.g., two products) uses `Promise.all` to keep the test fast; sequential `await` chains are used when order matters.
