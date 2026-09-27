---
source: src/modules/products/tests/integration/repository.test.ts
sha256: 4afec23970dc9fa4400c1c155ef3fca104b529ff4994925a40ece8001f2eaee1
generated_at: 2026-09-27T15:34:47.709621+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/integration/repository.test.ts

## Purpose

Integration tests for `productRepository` CRUD operations and aggregate reads (`facets`) executed against a real MongoDB instance. The file also pins the empty-catalogue behavior of aggregate pipelines (which return *no* row rather than a zeroed one) and the idempotency/staleness semantics of `writebackImage`.

## Key elements

- **`describe('productRepository')`** — covers `create`, `findById`, `findOne`, `findAll`, `count`, `save`, and `deleteOne`. Each sub-block seeds documents via the test factory and asserts repository-level contracts (e.g. `findById` returns `null` on miss, `findAll` returns lean plain-JS objects, `findAll` honors `limit`/`skip`).
- **`describe('an empty catalogue')`** — runs after `productModel.deleteMany({})` to verify:
  - `facets()` resolves to `{ categories: [], tags: [] }` (no crash on the absent `$facet` aggregate row).
  - `writebackImage` returns `true` on a matching `pendingImageKey`, `true` again on a duplicate run (idempotent — prevents twin-file deletion), and `false` when the key is stale.
- **`setupTestDb()`** — called at module top level to establish a real Mongo connection before any test runs.

## Relationships

- **`src/modules/products/repository.ts`** — the system under test; every assertion targets a `productRepository` method.
- **`src/modules/products/model.ts`** — imported as `productModel` and used to manipulate raw DB state that the repository API doesn't expose (e.g. setting `pendingImageKey` via `updateOne`, wiping the collection via `deleteMany`).
- **`src/modules/products/tests/factories.ts`** — supplies `makeProduct` (plain in-memory object for `create`) and `createProduct` (persists and returns a Mongoose document for subsequent tests).
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb()` to spin up and clean a real Mongo instance per test run.
- **`tests/support/stub.ts`** — provides `asStub<T>()`, a type-only cast used to assert that `findAll` results lack Mongoose instance methods (e.g. `.save`).

## Notes

- Stock aggregates (`sumReserved`, `countLowAvailability`, stock board) are deliberately **not** tested here; they belong to `@modules/inventory`'s `stockLevelRepository`.
- The empty-catalogue block exists because a MongoDB `$group`/`$facet` pipeline over zero documents yields **no row**, not a zeroed row. The `.at(0)` guard in calling code is asserted here rather than assumed.
- `findAll` is expected to return **lean** objects (no Mongoose methods), while `create`/`findById`/`findOne` return full Mongoose documents — the test suite asserts both sides of that distinction.
