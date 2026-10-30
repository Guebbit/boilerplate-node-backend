---
source: src/modules/products/tests/integration/repository.test.ts
sha256: 81190ee85691f6ee5b6df230ea05706ebf7d13053eb85edde67eb83b3fde0440
generated_at: 2026-10-29T05:33:35.432900+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/integration/repository.test.ts

## Purpose

Integration tests for `productRepository` run against a real MongoDB instance. Covers CRUD operations (`create`, `findById`, `findOne`, `findAll`, `count`, `save`, `deleteOne`), the `facets` aggregate, and the `writebackImage` image-processing callback — including the critical "empty catalogue" arms where `$group`/`$facet` pipelines return no row at all rather than a zeroed one.

## Key elements

- **`setupTestDb()`** — called at module top-level; provisions and tears down the test database for the whole suite.
- **`describe('productRepository')`** — CRUD test block:
  - `create` — verifies inserted document shape; asserts `imageUrl` is `undefined` (absent, not a placeholder).
  - `findById` / `findOne` — happy path and `null` return for missing documents.
  - `findAll` — no-filter, `limit`, `skip` pagination, `active` flag filter, and that results are lean plain-JS objects (no Mongoose `save` method).
  - `count` — total, filtered, and empty-collection (returns `0`).
  - `save` — persists mutations and confirms via a re-fetch.
  - `deleteOne` — removes only the targeted document.
- **`describe('an empty catalogue')`** — isolated block that wipes the collection in `beforeEach`:
  - `facets()` — asserts it resolves to `{ categories: [], tags: [] }` rather than crashing on an absent aggregate row.
  - `writebackImage` — verifies `true` for a matching `pendingImageKey`, `true` on a duplicate (idempotent) call, and `false` for a stale key.

## Relationships

- **`src/modules/products/repository.ts`** — the module under test; all assertions call its exported `productRepository`.
- **`src/modules/products/model.ts`** — `productModel` is imported directly (bypassing the repository) to wipe state (`deleteMany`) and to set `pendingImageKey` before `writebackImage` tests.
- **`src/modules/products/tests/factories.ts`** — supplies `makeProduct` (plain data object for `create`) and `createProduct` (persists via the repository and returns the document).
- **`tests/support/setup-test-db.ts`** — `setupTestDb` manages the shared Mongo test lifecycle.
- **`tests/support/stub.ts`** — `asStub` is a type-level cast used solely to assert that lean results lack Mongoose methods.

## Notes

- `productModel` is used directly (not through the repository) for test setup/teardown — this is intentional to manipulate fields (`pendingImageKey`) and clear state that the repository API doesn't expose.
- The "empty catalogue" block deliberately calls `productModel.deleteMany({})` in `beforeEach` so each test starts from a guaranteed-empty collection, independent of the CRUD block above.
- The file's doc comment explicitly notes that stock-related aggregates (`sumReserved`, `countLowAvailability`, stock board) are tested in the inventory module's `stockLevelRepository` tests, not here.
- `asStub` is not a mock; it is a zero-runtime-cost type assertion used to check the *absence* of a property on a lean object.
