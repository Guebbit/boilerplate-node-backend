---
source: src/modules/cart/tests/integration/schema-contract.test.ts
sha256: 5ede36d3681962d387ae7ef2e0b457e1bf98a7fcca0aeedca15ac3584288077a
generated_at: 2026-09-23T18:33:32.250535+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/schema-contract.test.ts

## Purpose

Integration test that verifies Mongoose schema-level declarations for the cart model (unique index, defaults, `required`, `select: false`) against a **real** MongoDB instance. It exists because these constraints live in the schema, not in repository logic, and would not be exercised by sibling transform tests.

## Key elements

- **`describe('cart schema', …)`** — top-level block scoped to schema contract assertions.
- **"refuses a second cart for the same user"** — the sole test. Creates a user, writes one cart via the repository, calls `cartModel.syncIndexes()`, then asserts a second `create` with the same `userId` rejects. Verifies the unique index is enforced at the DB level.

## Relationships

- **`src/modules/cart/model.ts`** — imports `cartModel` to invoke `syncIndexes()` (ensures the unique index exists before the duplicate-write assertion).
- **`src/modules/cart/repository.ts`** — imports `cartRepository` to perform the actual `create` calls under test.
- **`src/modules/users/tests/factories.ts`** — imports `createUser` to provision a user document for the cart's `userId` foreign key.
- **`tests/support/setup-test-db.ts`** — imports `setupTestDb` to connect to and seed a real MongoDB instance before any test runs.

## Notes

- **Real DB, not mocks.** The docstring explicitly calls out that index enforcement is Mongoose behaviour; a mock would assert its own implementation rather than the database contract.
- **`as never` cast.** The test passes `{ userId }` cast to `never` to bypass the repository's full input type. Only the `userId` field matters for the index assertion; supplying a complete valid payload is out of scope here.
- **`syncIndexes()` is required.** Mongoose does not guarantee index creation in every test environment; the call makes the unique index materialize before the duplicate-write assertion, avoiding a false pass.
- **Docstring scope vs. actual coverage.** The module comment lists "defaults, `required`, `select: false"` as in-scope, but the file currently contains only the unique-index test. The other declarations are either covered elsewhere or still pending.
