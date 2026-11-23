---
source: src/modules/cart/tests/integration/upsert-retry.test.ts
source_sha256: 81bec67f6e52919fa8a6a2fa564c086585a853034ddea9186b1b586a77121ca5
context_sha256: 0cc4a14106af77df67976156f18f84e6b5fcb8e96ad63a5b9f0800b2f8035455
generated_at: 2026-11-22T04:42:43.102410+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/tests/integration/upsert-retry.test.ts

## Purpose
Integration tests for the retry budget of `cartRepository.upsertLine`, the bound the repository comment calls "a pathological loop". Races are tested elsewhere (`tests/integration/concurrency/cart-races.test.ts`), but a race can't deterministically exhaust the budget, so this file forces failures by stubbing `cartModel.findOneAndUpdate`.

Invariants checked:
- A duplicate-key loss is retried, and the increment is applied exactly once.
- The loop is bounded at three attempts. Exhausting it throws instead of spinning or silently dropping the add.
- An exhausted add writes nothing.

## Key elements
- `ATTEMPTS` — the budget (3) that `upsertLine` starts with.
- `duplicateKey()` — builds an error with `code` 11000, as a driver raises for a lost unique-index race.
- `queryThatSettles(settle)` — returns a stub query whose `exec()` runs `settle`, typed via `asStub`.
- `cartWithLine(quantity)` — creates a user and a product, then adds `quantity` of the product to a cart through `upsertLine`. Returns `{ userId, productId }`.
- `stateOf(userId, productId)` — reads the cart via `findByUserId` and returns that product's `quantity` and the cart's `__v`.
- Suite `upsertLine under a lost unique-index race`:
  - A single duplicate-key failure is retried. The result has `created: false`, quantity goes from 2 to 5, and `__v` rises by exactly 1.
  - Persistent duplicate-key failures give up after exactly 3 calls. The error with `code` 11000 is rethrown and the state is unchanged.
  - A non-duplicate error (`connection reset`) is not retried. It is called once and the error is thrown.
- Suite `upsertLine when the atomic add keeps missing a line that has room`:
  - If `findOneAndUpdate` always resolves `null`, `upsertLine` stops after 3 calls and throws an error matching `exhausted retries`. State is unchanged.
  - If two misses are followed by the real call, it converges to quantity 5 with `created: false`.

## Relationships
- `src/modules/cart/repository.ts` — `cartRepository` is the code under test; the tests call its `upsertLine` and `findByUserId`.
- `src/modules/cart/model.ts` — `cartModel` is imported so its `findOneAndUpdate` can be stubbed to fail or miss on demand.
- `src/modules/users/tests/factories.ts` — `createUser` supplies the shopper.
- `src/modules/products/tests/factories.ts` — `createProduct` supplies the product.
- `tests/support/setup-test-db.ts` — `setupTestDb()` is called at module top level to provide the test database.
- `tests/support/stub.ts` — `asStub` casts the fake query object to the model's query type.

## Notes
- Setup runs against the real database. Only `findOneAndUpdate` is stubbed, and `mockImplementationOnce` lets later calls fall through to the real implementation. This is how the "converges" test and the single-retry test succeed.
- `afterEach` calls `jest.restoreAllMocks()` so spies do not leak between tests.
- The "keeps missing" test comment says the follow-up read must show room, so each pass decides to retry. That read is not stubbed.
- The count assertions on the `findOneAndUpdate` spy assume one call per attempt.
