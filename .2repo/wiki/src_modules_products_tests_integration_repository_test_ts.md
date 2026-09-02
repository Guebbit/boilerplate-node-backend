# src/modules/products/tests/integration/repository.test.ts

## Purpose

Integration test suite for `productRepository` executed against a real MongoDB instance. It verifies CRUD operations, pagination, lean-output guarantees, and the three aggregate reads (`facets`, `sumReserved`, `availabilityPage`)—with dedicated blocks that pin their behavior over an empty catalogue and that distinguish the two intentionally different stock gauges (`countLowAvailability` vs. `sumReserved`).

## Key elements

- **`describe('productRepository')`** — CRUD coverage: `create`, `findById`, `findOne`, `findAll` (including `limit`/`skip`/`active`-filter/lean-object assertions), `count`, `save`, `deleteOne`.
- **`describe('an empty catalogue')`** — Asserts `facets()` returns `{ categories: [], tags: [] }`, `sumReserved()` returns `0`, and `availabilityPage()` returns `{ items: [], totalItems: 0 }` when no documents exist (the `.at(0)` absent-row arm).
- **`describe('the two stock gauges count different populations')`** — Encodes the documented rule that `countLowAvailability` is scoped to active (customer-visible) products while `sumReserved` spans all products regardless of `active`.
- **`setupTestDb()`** (module-level call) — Configures the in-memory or local Mongo connection before any suite runs.
- **`asStub`** — Imported from `tests/support/stub`; used to assert `findAll` results are lean (no Mongoose `save` method).

## Relationships

- **`src/modules/products/index.ts`** — Source of the `productRepository` import (re-exported barrel).
- **`src/modules/products/model.ts`** — `productModel` is imported directly to call `deleteMany({})` in `beforeEach` for the aggregate test blocks.
- **`src/modules/products/tests/fixtures.ts`** — Provides `makeProduct` (builds a plain object) and `createProduct` (inserts and returns a Mongoose doc) used throughout.
- **`tests/support/setup-test-db.ts`** — Provides `setupTestDb` to wire up the test database.
- **`tests/support/stub.ts`** — Provides `asStub` for type-safe assertion on lean objects.

## Notes

- This is a **real-database** integration test; it does not mock Mongoose. `setupTestDb` is expected to clear/recreate the collection before the suite (or each file run).
- The "empty catalogue" and "two stock gauges" blocks call `productModel.deleteMany({})` in `beforeEach` for explicit isolation; the CRUD block relies on `setupTestDb`'s per-test teardown.
- The file documents (via comments) a cross-reference to `docs/modules/inventory-reservations.md` §"The threshold, and its two readers"—the semantic split between `countLowAvailability` and `sumReserved` is a deliberate business rule, not an oversight.
- `findAll` is asserted to return **lean** objects; if the repository implementation changes to return hydrated docs, the `asStub` assertion will fail.
