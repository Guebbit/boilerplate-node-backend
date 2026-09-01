# src/modules/orders/tests/integration/service-search.test.ts

## Purpose

Integration tests for the read half of `orderService.search`: filtering, pagination, and the three computed totals (`totalItems`, `totalQuantity`, `totalPrice`). The write half (`create`, `update`, `remove`) is covered in `service-crud.test.ts`. This file exists to guarantee that every search result passes through the repository's `normalize` step, which is the only mechanism that attaches the derived totals.

## Key elements

- **`setupTestDb()`** — initializes an isolated test database before all suites run.
- **`OrderWithTotals`** — local type extending `OrderDocument` with the three computed fields; used to type-assert results because the base type doesn't include them.
- **`describe('orderService.search — derived totals')`** — four tests asserting `totalItems` (distinct product lines), `totalQuantity` (sum of quantities), `totalPrice` (Σ price × qty), including a multi-product combination case.
- **`describe('orderService.search')`** — covers default pagination, filters (`userId`, `email` exact-match, `id`, `productId` on embedded items), page/pageSize slicing, the `scope` parameter (raw Mongoose filter merged into `$match`), and the empty-result edge case.

## Relationships

- **`src/modules/orders/service.ts`** — the module under test; the file imports and calls `orderService.search` exclusively.
- **`src/modules/orders/index.ts`** — source of the `OrderDocument` type used in the local `OrderWithTotals` definition.
- **`src/modules/orders/tests/fixtures.ts`** — provides `createOrder` and `toOrderItem` helpers for seeding orders with embedded product lines.
- **`src/modules/products/tests/fixtures.ts`** — provides `createProduct` for seeding the products referenced by order items.
- **`src/modules/users/tests/fixtures.ts`** — provides `createUser` for seeding users that own orders.
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb`, called once at module scope to prepare the database.

## Notes

- The three totals are **never persisted** on the order document. They are derived by the aggregate pipeline's `normalize` step (see `model.ts` / `applyOrderTransform`). Because `.aggregate()` bypasses Mongoose's `toJSON`, the only way they appear on a result is through that normalization pass — these tests exist to catch its absence on any new read path.
- The `scope` parameter (second argument to `search`) is a raw Mongoose filter object, not a typed search criteria; it is merged directly into the `$match` stage.
- The type assertion `items as OrderWithTotals[]` is required in every test that reads a total; without it TypeScript will not recognize the computed fields.
- Filtering by `email` is an **exact match**, not a substring search.
