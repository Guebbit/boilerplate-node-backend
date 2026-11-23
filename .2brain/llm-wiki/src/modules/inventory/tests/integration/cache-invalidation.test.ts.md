---
source: src/modules/inventory/tests/integration/cache-invalidation.test.ts
source_sha256: 921cd7a1d76311821a38ff6b4fb9088dda6a0389f8a2c75937d59aee29574d2c
context_sha256: 53dcaaa0e75762e7990042832a153b3316f23dd56cd3228184d996bb9926612f
generated_at: 2026-11-22T05:26:21.805222+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/tests/integration/cache-invalidation.test.ts

## Purpose
Integration test asserting which cache entries inventory stock writes invalidate. Stock writes (receive, adjust, return restock, sweep) must not clear the `products` cache tag, since product responses carry no stock. They must delete the per-product availability cache entry for every product they move, including every line of a multi-line checkout.

## Key elements
- `jest.mock('@infrastructure/adapters/cache', ...)`: keeps the real module but replaces `invalidateCacheTagsLogged` and `deleteCacheValues` with resolved-promise `jest.fn`s. The module is replaced rather than spied on because a CommonJS namespace import exposes a non-configurable getter that `jest.spyOn` can't redefine.
- `setupTestDb()`: sets up the test database. `beforeEach` clears the two mocks and `afterEach` calls `jest.restoreAllMocks()`.
- `anOrderId()`: returns a unique 24-character hex-like order id (counter in hex, left-padded with `c`).
- `entryKeyOf(product)`: builds the expected key, `availability:<id>`.
- Describe "the products cache tag, left alone by stock writes": an `it.each` over `receive`, `adjust`, and `restockReturnedLines` (inside `withTransaction`, followed by `forgetAvailability([id])`). Each case asserts `invalidateCacheTagsLogged` was not called with `['products']`.
- Describe "a multi-line checkout clears the availability entry of every line":
  - Reserving three products via `reserveForOrder` returns `held: true`. The keys passed to `deleteCacheValues` include every product's availability key, and the last product's `reserved` counter is 1 (checked with `countersOf`).
  - When the rollback fails, `reservationRepository.claimStatus` is mocked to reject. The refused product has been adjusted to zero stock, so `reserveForOrder` returns `held: false`. The availability key of the product that was already taken is still deleted.

## Relationships
- `src/infrastructure/adapters/cache.ts`: its `invalidateCacheTagsLogged` and `deleteCacheValues` exports are mocked and asserted on.
- `src/modules/inventory/services/index.ts`: `inventoryService` (`receive`, `adjust`, `restockReturnedLines`, `forgetAvailability`, `reserveForOrder`) is the code under test.
- `src/modules/inventory/repository.ts`: exports `reservationRepository`, whose `claimStatus` method is spied on (made to reject) to simulate a failed release.
- `src/infrastructure/runtime/database.ts`: `withTransaction` supplies the session for `restockReturnedLines`.
- `src/modules/products/tests/factories.ts`: `createProduct` seeds products with `onHand` stock, and `countersOf` reads their counters.
- `tests/support/callers.ts`: `testCallerContext` is passed to `receive` and `adjust`.
- `tests/support/setup-test-db.ts`: provides `setupTestDb`.

## Notes
- In the rollback test, lines are taken in product-id order, so the test sorts the two products by id to decide which is taken and which is refused.
- The test clears the `deleteCacheValues` mock after its setup `adjust`, so only the checkout's deletions are inspected.
- The file imports from `@modules/products/tests/factories` in two separate statements, and uses both `@tests/...` alias paths and relative paths.
