---
source: src/modules/cart/tests/integration/upsert-retry.test.ts
sha256: bbbe42a3289c565417bfd6a55c44f1236e9e9708e8e3a3b62c85a075a9a7bbe8
generated_at: 2026-10-14T15:19:25.079913+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/upsert-retry.test.ts

## Purpose

Deterministically exercises the retry budget (3 attempts) inside `cartRepository.upsertLine` by forcing the model's atomic write to fail or miss on demand. It verifies three invariants: a duplicate-key loss is retried and the increment is applied exactly once; exhausting the budget throws (duplicate-key or "exhausted retries") and writes nothing; and non-duplicate-key errors are surfaced immediately without retry. The actual race condition is covered in `concurrency/cart-races.test.ts`; this file isolates the *bound* that a real race cannot trigger deterministically.

## Key elements

- **`ATTEMPTS`** (const = 3) — the retry budget asserted against `findOneAndUpdate` call counts.
- **`duplicateKey()`** — builds an `Error` with `code: 11000`, matching a MongoDB unique-index violation.
- **`queryThatSettles(settle)`** — wraps `asStub` to produce a `findOneAndUpdate` query whose `exec()` delegates to the provided promise-returning function.
- **`cartWithLine(quantity)`** — creates a user + product via factories, seeds a cart line, returns `{ userId, productId }`.
- **`stateOf(userId, productId)`** — reads the cart back and returns the line's `quantity` and the cart's `__v` (Mongoose version).
- **`describe("…lost unique-index race")`** — three tests: retry succeeds, budget exhausts with `code 11000`, non-duplicate error is not retried.
- **`describe("…atomic add keeps missing")`** — two tests: `findOneAndUpdate` resolving `null` exhausts the budget with "exhausted retries"; two misses then a success converges to the correct quantity.

## Relationships

- **`src/modules/cart/repository.ts`** — `cartRepository.upsertLine` is the system under test; `cartRepository.findByUserId` is used by the `stateOf` helper to assert post-conditions.
- **`src/modules/cart/model.ts`** — `cartModel.findOneAndUpdate` is spied on and mocked to simulate failures; the test never touches a real DB write path.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called once at module level to configure the in-memory/transactional test database.
- **`tests/support/stub.ts`** — `asStub` is used by `queryThatSettles` to build a mock query object.
- **`src/modules/users/tests/factories.ts`** — `createUser` seeds a user document.
- **`src/modules/products/tests/factories.ts`** — `createProduct` seeds a product document.

## Notes

- The mock target is `cartModel.findOneAndUpdate` (model layer), not the repository. This means the test exercises the repository's *retry loop* while the model's atomic operation is the forced point of failure.
- `jest.restoreAllMocks()` runs in `afterEach`; individual tests rely on `mockImplementationOnce` (finite) vs. `mockImplementation` (persistent for the remainder of that test).
- The "missing line" scenario (`Promise.resolve(null)`) simulates the `findOneAndUpdate` filter no longer matching — i.e., another concurrent write shifted the document between read and write — without actually racing threads.
- The module docblock explicitly states this file is the complement to `concurrency/cart-races.test.ts`; the two are designed to be read together.
