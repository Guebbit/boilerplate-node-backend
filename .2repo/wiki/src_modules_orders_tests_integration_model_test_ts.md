# src/modules/orders/tests/integration/model.test.ts

## Purpose
Integration tests verifying that orders never leak `_id` or `__v` in any serialization path—hydrated `toJSON`, `.aggregate()` results, and scoped lookups—and that embedded product snapshots are normalized (id → `_id` stripped, items carry no `_id`). Also guards against Mongoose silently copying product-schema indexes onto the order schema.

## Key elements
- **`describe('order serialization')`** — four tests asserting `_id`/`__v` absence and `id` presence across:
  - `order.toJSON()` (hydrated document path)
  - `orderService.search()` (aggregate path, no args)
  - `orderService.search({})` (aggregate path, empty query)
  - `orderService.getById(id, { userId })` (scoped aggregate path)
- **`describe('embedded product snapshot indexes')`** — one test that inspects `orderSchema.indexes()` and asserts no index path contains `product` (prevents Mongoose from inheriting `productSchema` indexes via nested embedding).
- **`setupTestDb()`** — called once at module level to create/tear down a fresh MongoDB instance for the suite.
- **`asStub<T>()`** — type-assert helper (from `tests/support/stub.ts`) to cast the aggregate result into a plain `Record` for key inspection without a full type.

## Relationships
- **`src/modules/orders/model.ts`** — imports `orderSchema` to inspect its declared indexes in the snapshot-index test.
- **`src/modules/orders/service.ts`** — imports `orderService.search()` and `orderService.getById()` as the system under test for aggregate/lookup serialization.
- **`src/modules/orders/tests/fixtures.ts`** — provides `createOrder` and `toOrderItem` to build realistic order documents in the test DB.
- **`src/modules/products/tests/fixtures.ts`** — provides `createProduct` for the embedded product snapshot.
- **`src/modules/users/tests/fixtures.ts`** — provides `createUser` as the order owner.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` bootstraps the in-memory/Mongo test database.
- **`tests/support/stub.ts`** — `asStub` type-assertion helper for inspecting untyped aggregate output.

## Notes
- Two tests in the serialization block share the identical `it` title `"normalizes aggregate results (search) the same way"` (one calls `search()`, the other `search({})`). Intentional duplication to cover the no-arg vs. empty-object code paths, but easy to overlook when running a single test by name.
- The index-smuggling test lives here rather than in a generic index suite because it asserts a fact specific to *this module's* schema composition (`excludeIndexes` on `items.product`).
- Aggregation results bypass Mongoose's `toJSON` virtuals entirely (plain JS objects), so normalization relies on the service's manual `applyOrderTransform` mapping—these tests pin that contract down.
