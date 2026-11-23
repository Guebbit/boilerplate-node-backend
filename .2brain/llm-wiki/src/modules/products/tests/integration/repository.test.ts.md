---
source: src/modules/products/tests/integration/repository.test.ts
source_sha256: 74809a2ef626095e7c6ca93a89064400924b1bdb610a7f072774a327d058162f
context_sha256: 25d13ec7b781f60d9bc1f8802e66db5323cb8d89e7ecc1c601be405701a8605e
generated_at: 2026-11-22T07:17:41.946099+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/tests/integration/repository.test.ts

## Purpose
Integration tests for `productRepository` run against a real Mongo instance. They cover CRUD, listing and counting, the `facets` aggregate, and `writebackImage`, including how these behave over an empty catalogue. An empty `$group` or `$facet` returns no row at all rather than a zeroed one, so these tests assert that case explicitly. Stock aggregates (`sumReserved`, `countLowAvailability`, the stock board) are not tested here. They belong to `stockLevelRepository` in `@modules/inventory`.

## Key elements
- `setupTestDb()` is called at module level to provide the database lifecycle for the suite.
- `describe('productRepository')` holds the tests for each repository method:
  - `create` returns a Mongoose document with `_id`, and leaves `imageUrl` undefined when none is given (the schema has no default).
  - `findById` returns the product, or `null` for a non-existent id (`'000000000000000000000000'`).
  - `findOne` returns a product matching the query, or `null` when nothing matches.
  - `findAll` covers no filter, `limit`, `skip` pagination and an `active` filter. It also checks that results are lean objects with no `save` method.
  - `count` works with and without a filter, and returns 0 on an empty collection.
  - `save` persists mutations made to an existing document.
  - `deleteOne` removes the document permanently and leaves other documents untouched.
- `describe('an empty catalogue')` clears the collection with `productModel.deleteMany({})` in `beforeEach`.
  - `facets()` is expected to resolve to `{ categories: [], tags: [] }` rather than crash on the missing aggregate row.
  - `writebackImage(id, key, urls)` is tested in three cases:
    - It returns `true` when the document's `pendingImageKey` matches the key.
    - It returns `true` again on a duplicate run of the same job, so the twin files are not deleted.
    - It returns `false` for a stale job whose document has a different `pendingImageKey`.

## Relationships
- `../../repository` supplies `productRepository`, the unit under test.
- `../../model` supplies `productModel`, used to clear the collection and to set `pendingImageKey` directly with `updateOne`.
- `@modules/products/tests/factories` supplies `makeProduct` (an unsaved payload) and `createProduct` (a persisted document). The tests rely on its defaults, such as the title 'Test Product' and an `active` value of true.
- `@tests/setup-test-db` supplies `setupTestDb`, which connects the suite to the test Mongo.
- `@tests/stub` supplies `asStub`, used to cast a lean result so the missing `save` method can be checked.

## Notes
- The `describe('an empty catalogue')` block sits outside the main `describe('productRepository')`, and the `writebackImage` tests are nested inside it. Because of the `beforeEach` there, each of those tests starts from an empty collection.
- `price` is a string (`'9.99'`, `'99.99'`), not a number.
