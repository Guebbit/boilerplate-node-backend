---
source: src/modules/cart/tests/integration/schema-contract.test.ts
source_sha256: 17ccab8387ac0d25c7ec1a083ecc60477845eb153d56f74afdc32fdcf8a237eb
context_sha256: ce6fb3291ec60394a971627f177e9b6606236966717fe3deaa967c17a726fd9a
generated_at: 2026-11-22T04:41:41.456749+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/tests/integration/schema-contract.test.ts

## Purpose
Integration test that checks the cart Mongoose schema's declarations (defaults, `required`, `select: false`, indexes) against a real Mongo instance, not a mock. The header explains that these declarations are part of the API and aren't covered by the sibling specs, which test transforms. Currently, the file contains one test.

## Key elements
- `setupTestDb()`: called at module level to set up the test database.
- `describe('cart schema')` with one test, `refuses a second cart for the same user`:
  - Creates a user via `createUser({ email: 'twice@example.com' })`.
  - Creates a cart for that user with `cartRepository.create({ userId })`.
  - Calls `cartModel.syncIndexes()` so the unique index exists.
  - Expects a second `cartRepository.create` for the same user to reject.

## Relationships
- `@modules/cart/model`: provides `cartModel`. The test calls `syncIndexes()` on it to build the schema's indexes.
- `@modules/cart/repository`: provides `cartRepository`. The test uses its `create` to write carts.
- `@modules/users/tests/factories`: provides `createUser`, which creates the user that owns the cart.
- `@tests/setup-test-db` (`tests/support/setup-test-db.ts`): provides `setupTestDb`, which sets up the real database the test runs against.

## Notes
- `syncIndexes()` is called explicitly before the duplicate insert. The test relies on the unique index being built first, so the uniqueness it checks is the database's, not a check in application code.
- The assertion is only `rejects.toThrow()`. It doesn't check the error type or message.
