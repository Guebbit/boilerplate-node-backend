---
source: src/modules/products/tests/integration/repository.test.ts
sha256: 02baa851a35b750ec095bd0183984cf235027568019454476054d83912e26d1c
generated_at: 2026-09-23T19:29:47.216895+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/integration/repository.test.ts

## Purpose

Integration tests for `productRepository` run against a real MongoDB instance. They pin CRUD behavior (`create`, `findById`, `findOne`, `findAll`, `count`, `save`, `deleteOne`) and the `facets` aggregate read, including the degenerate case where the collection is empty and `$group`/`$facet` pipelines return no row at all rather than a zeroed one.

## Key elements

- **`setupTestDb()`** — called at module scope; provisions and resets the test database before any suite runs.
- **`describe('productRepository')`** — the main suite, subdivided into `create`, `findById`, `findOne`, `findAll`, `count`, `save`, `deleteOne`.
    - `findAll` tests verify `skip`/`limit` pagination, filter application, and that returned objects are lean (no Mongoose instance methods like `save`).
    - `create` tests verify insertion round-trip and the schema's `imageUrl` default.
- **`describe('an empty catalogue')`** — separate suite that wipes the collection in `beforeEach` and asserts `facets()` resolves to `{ categories: [], tags: [] }`, guarding the `.at(0)` absent-row path in calling code.

## Relationships

- **`src/modules/products/repository.ts`** — the module under test; `productRepository` is the only export exercised.
- **`src/modules/products/model.ts`** — `productModel` is used solely in the empty-catalogue `beforeEach` to call `deleteMany({})`.
- **`src/modules/products/tests/factories.ts`** — provides `makeProduct` (plain-data factory) and `createProduct` (persists a product and returns the doc), used throughout as setup helpers.
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb`, the real-Mongo bootstrap invoked once at import time.
- **`tests/support/stub.ts`** — provides `asStub`, a type-only cast used to access the `save` property for the lean-object assertion without widening the type.

## Notes

- Stock-level aggregates (`sumReserved`, `countLowAvailability`, stock board) are explicitly **out of scope** here; they are covered by `@modules/inventory`'s `stockLevelRepository` tests.
- The empty-catalogue suite is deliberately separated from the CRUD suite so its `beforeEach` wipe doesn't interfere with the seeded-data assertions above.
- `findAll` is asserted to return lean objects (no `.save`, no Mongoose methods), which means callers receive plain JS objects, not hydrated documents.
