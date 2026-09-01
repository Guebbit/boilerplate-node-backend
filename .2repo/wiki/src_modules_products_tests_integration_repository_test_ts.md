# src/modules/products/tests/integration/repository.test.ts

## Purpose

Integration tests for `productRepository` executed against a real MongoDB instance. Covers CRUD operations (create, find, count, save, delete) and pins the empty-catalogue contract for the aggregate reads (`facets`, `sumReserved`, `availabilityPage`), where a `$group`/`$facet` pipeline returns no row at all rather than a zeroed one.

## Key elements

- **`describe('productRepository')`** — main suite; each nested `describe` maps to one repository method: `create`, `findById`, `findOne`, `findAll`, `count`, `save`, `deleteOne`.
- **`describe('an empty catalogue')`** — isolated suite that wipes the collection in `beforeEach` (`productModel.deleteMany({})`) and asserts the three aggregate methods return safe defaults (`{ categories: [], tags: [] }`, `0`, `{ items: [], totalItems: 0 }`).
- **`setupTestDb()`** — called at module top-level to provision and connect the test database before any test runs.
- **`asStub<{ save?: unknown }>`** — used in the `findAll` lean-objects test to assert Mongoose document methods (e.g. `save`) are absent on returned plain objects.

## Relationships

- **`@modules/products`** (`src/modules/products/index.ts`) — imports `productRepository`, the unit under test.
- **`../../model`** (`src/modules/products/model.ts`) — imports `productModel` solely for `deleteMany({})` cleanup in the empty-catalogue suite.
- **`@modules/products/tests/fixtures`** (`src/modules/products/tests/fixtures.ts`) — provides `makeProduct` (plain input object) and `createProduct` (helper that inserts via the repository and returns the document).
- **`@tests/setup-test-db`** (`tests/support/setup-test-db.ts`) — initialises the in-memory or local Mongo instance for the suite.
- **`@tests/stub`** (`tests/support/stub.ts`) — `asStub` cast helper used to probe for absence of Mongoose methods.

## Notes

- The file runs against a **real** Mongo instance (not an in-memory mock), so CI must have a MongoDB available or `setupTestDb` must spin one up.
- The empty-catalogue suite intentionally **does not** share state with the main suite; its `beforeEach` wipe means the main suite must run first or be independent. In practice Jest runs top-level `describe` blocks in file order, so the main suite seeds data and the empty-catalogue suite wipes it.
- `findAll` tests assert **lean** (plain-object) output via the `asStub` check — if the repository ever stops calling `.lean()`, this test fails.
- The `create` test for `imageUrl` does not assert the schema default value itself; it only confirms a supplied URL round-trips. The default is a schema concern, not a repository concern.
