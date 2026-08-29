# src/modules/products/tests/integration/repository.test.ts

## Purpose

Integration test suite for the `productRepository` CRUD interface and its aggregate queries. It exercises the full stack (repository → Mongoose model → MongoDB) against a real test database, verifying both the happy-path behaviors and the empty-collection edge cases that calling code guards against.

## Key elements

- **`describe('productRepository')`** — top-level block covering `create`, `findById`, `findOne`, `findAll`, `count`, `save`, and `deleteOne`.
- **`describe('an empty catalogue')`** — separate block that wipes the collection in `beforeEach` and asserts the "absent-row" arms: `facets()` returns empty arrays, `sumReserved()` returns `0`, and `availabilityPage()` returns `{ items: [], totalItems: 0 }` rather than throwing on a missing `$group`/`$facet` row.
- **`setupTestDb()`** — called at module load; provisions a clean in-memory (or temp) MongoDB instance for the entire suite.
- **`makeProduct` / `createProduct`** (from `@modules/products/tests/factory`) — builders that produce valid product documents; `createProduct` additionally persists one to the test DB.
- **`asStub<T>()`** (from `@tests/stub`) — a type-narrowing helper used to assert that `findAll` returns plain JS objects (no Mongoose `save` method).

## Relationships

- **`src/modules/products/index.ts`** — source of the `productRepository` export under test (imported via `@modules/products`).
- **`src/modules/products/repository.ts`** — the system under test; every assertion validates its public API.
- **`src/modules/products/model.ts`** — imported as `productModel` for the `deleteMany({})` cleanup in the empty-catalogue block.
- **`src/modules/products/tests/factory.ts`** — provides `makeProduct` (in-memory builder) and `createProduct` (persist-and-return) fixtures.
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb`, which configures the Mongoose connection to the test database before any test runs.
- **`tests/support/stub.ts`** — provides `asStub`, a cast helper used to type-narrow an object for property-existence assertions.

## Notes

- The `findAll` "lean objects" test uses `asStub` to check that `product.save` is `undefined`; this is a deliberate contract assertion that `findAll` strips Mongoose document methods.
- The `findOne` "first match" test intentionally does **not** assert which of the two inserted products is returned, because MongoDB does not guarantee insertion order in query results.
- The empty-catalogue block runs **after** the main suite and relies on `productModel.deleteMany({})` in `beforeEach`; it does not use the factory helpers.
- `create` and `save` tests assert on full Mongoose documents (with `_id`, methods available), while `findAll`/`findOne`/`findById` assert on lean or document shapes depending on the repository's internal implementation—read the assertions to distinguish which path returns what.
