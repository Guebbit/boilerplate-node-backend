---
source: src/modules/orders/tests/integration/repository.test.ts
source_sha256: 8b4c3478512d9d886d69f87ee43f2bb8d4a1035461f932c9ece34def514dbfd6
context_sha256: 4bbb319eef7e874832b708f68d3be2433e116e0e34e716c925d01148ffa8ce1e
generated_at: 2026-11-22T06:32:06.609629+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/tests/integration/repository.test.ts

## Purpose
Integration tests for `orderRepository` against a real test database. They cover inserting orders through the fixture builders, the raw `.aggregate()` passthrough that `orderService.search` is built on, and `findByIdScoped`. The aggregate cases pin that the repository does not reshape Mongo pipeline stages, so that behavior is a deliberate design rather than an untested assumption.

## Key elements
- `setupTestDb()`: called once at module level to provision the database for the suite.
- `describe('create')`: checks that `createOrder` returns a Mongoose document with `_id`, `email` and `userId`. It also checks that line quantities are stored, that the full product snapshot (`title`, `price`) is embedded rather than referenced, and that multiple products in one order work.
- `describe('aggregate')`:
  - A match-all `[{ $match: {} }]` returns all orders. An empty pipeline is not used, because it throws `MongooseError: Aggregate has empty pipeline`.
  - `$match` filters by `userId`.
  - `$count` returns the document count.
  - `$addFields` computes `totalQuantity` and `totalPrice`. `totalPrice` stays a Decimal128 and is read with `toMinorUnits(..., 'EUR')`, so 10.00 × 4 gives 4000.
  - `$sort` with `DEFAULT_SORT`, then `$skip` and `$limit`, returns the remaining 2 of 5 orders when skipping 3.
- `describe('findByIdScoped')`:
  - Resolves the same hydrated Mongoose document whether or not an owner scope is passed. The test checks `_id` and that `toJSON` is a function.
  - Resolves to a falsy result (the test asserts `toBeUndefined()`) when the scope (`ownerScope` of a different user) does not cover the order.

## Relationships
- `../../repository` (`src/modules/orders/repository.ts`): the unit under test. The tests use `create`, `aggregate`, `findByIdScoped` and `ownerScope`.
- `src/modules/orders/tests/factories.ts`: supplies `createOrder`, `makeOrder` and `toOrderItem`.
- `src/modules/users/tests/factories.ts`: supplies `createUser`.
- `src/modules/products/tests/factories.ts`: supplies `createProduct`.
- `tests/support/setup-test-db.ts`: supplies `setupTestDb`.
- `src/domain-primitives/money.ts`: supplies `toMinorUnits`, used to read the summed Decimal128 price.
- `src/infrastructure/persistence/search.ts`: supplies `DEFAULT_SORT`, the sort used in the pagination test.

## Notes
- The pagination test uses `DEFAULT_SORT` because a page is only well-defined when the sort before `$skip` is total (the file's comments call this a tiebreaker).
- `findByIdScoped` has its own block because neither TypeScript nor a response-body assertion can catch a regression to two result shapes. It is meant to be a single `findOne({ _id, ...scope })`, never the aggregation pipeline `search` uses.
- Tests that need two users pass distinct emails, because `users.email` is unique and the factory default would collide.
