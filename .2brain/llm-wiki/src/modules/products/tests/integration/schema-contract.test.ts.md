---
source: src/modules/products/tests/integration/schema-contract.test.ts
sha256: 22a339f056fd150571c14112eb21da4b50b5ac2b8518ea124bfa84a8b406cad6
generated_at: 2026-09-23T19:29:55.461737+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/integration/schema-contract.test.ts

## Purpose

Verifies Mongoose schema-level contracts on the Product model — `required` semantics, `toJSON` serialization shape — against a **real** Mongo instance. It exists as a separate integration spec so that Mongoose's own behaviour (not application transforms) is tested, which a mocked model could not faithfully represent.

## Key elements

- **`setupTestDb()`** (from `@tests/setup-test-db`) — initialises the real in-memory Mongo test database before the suite runs.
- **`describe('product schema')`** — the single test group containing two assertions:
    - _accepts a price of zero_ — calls `productRepository.create` with only `title` and `price: 0` (cast `as never` to bypass TS), asserts `price` round-trips as `0`. Guards against a truthiness-based `required` guard.
    - _serialises to id, never \_id or \_\_v_ — creates a product via the factory, inspects `product.toJSON()`, asserts `id` equals `String(_id)` and that `_id` / `__v` keys are absent from the output.

## Relationships

- **`src/modules/products/repository.ts`** — imports `productRepository` to create a product with a deliberately minimal (and type-unchecked) payload, exercising the schema directly.
- **`src/modules/products/tests/factories.ts`** — imports `createProduct` for the serialization test, which needs a fully-populated document.
- **`tests/support/setup-test-db.ts`** — imports `setupTestDb` to spin up the real Mongo connection the suite depends on.

## Notes

- The `as never` cast on the `create` call is intentional: it lets the test pass a field set that the TypeScript type does not require, proving the schema (not the type) is what enforces `required`.
- This file lives under `tests/integration/` to signal it needs a running Mongo; do not convert it to a unit test or swap the repository for a mock.
