---
source: src/modules/products/tests/integration/repository.test.ts
sha256: 7b9acb9748f8e3ee67541281e7d1c48dcf6215a93a47d1d295d319cdb9abcdf2
generated_at: 2026-10-15T11:49:00.850636+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/integration/repository.test.ts

## Purpose

Integration test suite for `productRepository` that exercises CRUD operations, aggregate reads (`facets`), and image-writeback logic against a real MongoDB instance. It specifically pins down the empty-catalogue arms of `$group`/`$facet` pipelines (which return no row rather than a zeroed one) and the idempotent/stale-job behaviour of `writebackImage`. Stock-level aggregates are explicitly out of scope and live in the inventory module's own tests.

## Key elements

- **`describe('productRepository')`** — top-level suite covering `create`, `findById`, `findOne`, `findAll`, `count`, `save`, `deleteOne`.
- **`describe('an empty catalogue')`** — second top-level suite that wipes the collection in `beforeEach` and asserts:
  - `facets()` resolves to `{ categories: [], tags: [] }` (no crash on absent aggregate row).
  - `writebackImage` returns `true` on match, `true` on duplicate (idempotent), and `false` on a stale `pendingImageKey`.
- **`setupTestDb()`** — called at module scope to boot and reset the test MongoDB before any test runs.
- **`makeProduct` / `createProduct`** — test factories for building and persisting fixture products.
- **`asStub`** — utility cast used to verify `findAll` returns lean (plain-JS) objects with no Mongoose methods like `save`.

## Relationships

- **`src/modules/products/repository.ts`** — system under test; `productRepository` is the sole subject of every assertion.
- **`src/modules/products/model.ts`** — `productModel` is imported directly to perform raw `deleteMany({})` (empty-catalogue reset) and `updateOne` (to set `pendingImageKey` before calling `writebackImage`).
- **`src/modules/products/tests/factories.ts`** — provides `makeProduct` (in-memory object) and `createProduct` (insert + return doc) used throughout the suite.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the shared test database connection and collection cleanup.
- **`tests/support/stub.ts`** — `asStub<T>()` cast lets the lean-object assertion type-check without adding a real dependency on Mongoose types.
- **`src/modules/products/factories.ts`** — transitive dependency pulled in by the test factories (`tests/factories.ts`); not imported directly by this file.

## Notes

- The empty-catalogue suite relies on `productModel.deleteMany({})` in `beforeEach`, not on the repository API, to guarantee a clean slate for the aggregate edge cases.
- `findAll` is asserted to return **lean** documents (no `.save` method). If the repository implementation ever switches to returning hydrated Mongoose docs, the `asStub` check will catch it.
- The `findOne` multi-match test deliberately avoids asserting which document is returned, since insertion order is not guaranteed; it only checks that a document is returned.
- `writebackImage` idempotency (duplicate job → `true`) is a contractual guarantee for the image-pipeline caller so that twin files are not deleted on a re-run.
