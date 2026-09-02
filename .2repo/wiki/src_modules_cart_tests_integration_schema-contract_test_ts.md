# src/modules/cart/tests/integration/schema-contract.test.ts

## Purpose

Integration test that verifies Mongoose schema-level declarations (here, the unique index on `userId`) against a **real** MongoDB instance. It exists because schema constraints are part of the public API contract and aren't exercised by the sibling transform/behaviour specs; mocking would assert the mock's own behaviour rather than Mongoose's index enforcement.

## Key elements

- **`setupTestDb()`** — called at module level to spin up a real test database before any test runs.
- **`describe('cart schema')`** — single spec: creates a user, inserts one cart via `cartRepository.create`, syncs indexes, then asserts a second `create` for the same `userId` rejects. This proves the **unique index** (not an application-level guard) is what enforces the one-cart-per-user invariant.

## Relationships

- **`src/modules/cart/repository.ts`** — `cartRepository.create` is the write path used to attempt duplicate insertion and trigger the index constraint.
- **`src/modules/cart/model.ts`** — `cartModel.syncIndexes()` is called explicitly to ensure the unique index physically exists in the test database before the duplicate-write assertion.
- **`src/modules/users/tests/fixtures.ts`** — `createUser` supplies a valid user document whose `_id` populates the `userId` field under test.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` provisions the real MongoDB connection and lifecycle for the entire integration suite.

## Notes

- `syncIndexes()` is required in-test because the test database starts without indexes; omitting it would make the duplicate-write assertion vacuous.
- The `as never` cast on the `create` payload signals the repository's typed signature expects more fields (e.g. `items`) than this schema-contract test cares about — the test is intentionally minimal.
- Real Mongo is used deliberately: the behaviour under test (index rejection) is Mongoose's, not application code, so a mock would defeat the purpose.
