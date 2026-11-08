---
source: src/modules/products/tests/integration/repository.test.ts
sha256: e8490c473355ba2e2a74c0359dcd4985d7a4f6b4a2ab2047a881213b611f364a
generated_at: 2026-11-08T07:52:30.331264+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/integration/repository.test.ts

## Purpose

Integration tests for `productRepository` run against a real MongoDB instance. Covers the full CRUD surface (`create`, `findById`, `findOne`, `findAll`, `count`, `save`, `deleteOne`), the `facets` aggregate read, and the `writebackImage` image-pipeline callback. A dedicated "empty catalogue" block pins the no-row-at-all behaviour of Mongo `$group`/`$facet` pipelines and the idempotency/staleness semantics of `writebackImage`.

## Key elements

- **`describe('productRepository')`** — top-level block exercising each CRUD method with seeded and unseeded data, including `limit`/`skip` pagination, `active`-flag filtering, and lean-object assertions.
- **`describe('an empty catalogue')`** — cleanup via `productModel.deleteMany({})` in `beforeEach`; asserts `facets()` resolves to `{ categories: [], tags: [] }` and exercises `writebackImage` success, duplicate-run, and stale-key paths.
- **`setupTestDb()`** — called once at module scope to provision a real Mongo connection before any test runs.
- **`makeProduct` / `createProduct`** (from test factories) — `makeProduct` yields a plain input object for `create`; `createProduct` inserts a document and returns the Mongoose doc for subsequent assertions.
- **`asStub`** (from `tests/support/stub.ts`) — type-level cast used to assert the *absence* of Mongoose methods on lean `findAll` results.

## Relationships

- **`src/modules/products/repository.ts`** — the system under test; every assertion calls a method on `productRepository`.
- **`src/modules/products/model.ts`** — accessed directly (`productModel.deleteMany`, `productModel.updateOne`) in the empty-catalogue block to seed `pendingImageKey` values and to wipe the collection, bypassing the repository on purpose.
- **`src/modules/products/tests/factories.ts`** — source of `makeProduct` and `createProduct` helpers.
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb` which wires up the real Mongo instance for the suite.
- **`tests/support/stub.ts`** — provides the `asStub` utility for asserting absence of properties.

## Notes

- `setupTestDb()` runs at **module top level**, not inside `beforeAll`; if other test files in the same process also call it, ordering of module evaluation matters.
- The "empty catalogue" block deliberately avoids the shared factory helpers for its `writebackImage` seeds (uses `productModel.updateOne` directly) to simulate an external image-digestion job writing a key onto the document.
- Stock aggregates (`sumReserved`, `countLowAvailability`, stock board) are **explicitly out of scope** here; the module doc-comment points to `@modules/inventory`'s own test suite.
- `findAll` is tested to return **lean** (plain JS) objects; the `asStub` assertion is the only place that verifies no Mongoose prototype methods leak through.
