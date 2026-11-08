---
source: src/modules/cart/tests/integration/upsert-retry.test.ts
sha256: bbbe42a3289c565417bfd6a55c44f1236e9e9708e8e3a3b62c85a075a9a7bbe8
generated_at: 2026-11-08T05:23:59.838938+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/upsert-retry.test.ts

## Purpose

Deterministic integration tests for `upsertLine`'s bounded retry loop. While the sibling `cart-races.test.ts` exercises real concurrency, this file *forces* the failure modes a race would produce (duplicate-key rejection, or the atomic filter persistently missing) to verify the retry budget, its termination behavior, and that no partial writes leak on exhaustion.

## Key elements

- **`ATTEMPTS`** (= 3) — local mirror of the production retry budget; used in assertions.
- **`duplicateKey()`** — factory for a `code: 11000` error matching MongoDB's unique-index violation.
- **`queryThatSettles(settle)`** — wraps an arbitrary promise in the shape of `cartModel.findOneAndUpdate`'s query handle (via `asStub`), so `exec()` resolves or rejects per the caller's instruction.
- **`cartWithLine(quantity)`** — creates a user + product via factories and seeds a cart line through the real repository; returns IDs for subsequent assertions.
- **`stateOf(userId, productId)`** — reads back the cart line's quantity and document version for before/after comparison.
- **`describe('…lost unique-index race…')`** — three tests: single retry succeeds (increment applied once), three failures → throws with `code: 11000` and zero writes, non-duplicate error → no retry (1 call).
- **`describe('…atomic add keeps missing…')`** — two tests: persistent `null` result exhausts budget and throws `'exhausted retries'`; two misses followed by a real success still converges (quantity = 5).

## Relationships

- **`src/modules/cart/repository.ts`** — system under test; `upsertLine` (retry loop) and `findByUserId` (read-back) are called.
- **`src/modules/cart/model.ts`** — `cartModel.findOneAndUpdate` is spied on to inject deterministic failures/misses.
- **`src/modules/products/tests/factories.ts`** — `createProduct` seeds a real product document.
- **`src/modules/users/tests/factories.ts`** — `createUser` seeds a real user (cart owner).
- **`tests/support/setup-test-db.ts`** — `setupTestDb` handles DB connect/teardown for the whole suite.
- **`tests/support/stub.ts`** — `asStub` provides the minimal query-handle shape needed to satisfy the repository's `exec()` contract.

## Notes

- The distinction between `mockImplementationOnce` (one forced failure, then real) and `mockImplementation` (every call fails) is the mechanism that separates the "recovers" tests from the "exhausts" tests. Reading the calls without that distinction makes the tests look identical.
- `afterEach` calls `jest.restoreAllMocks()`; no manual `mockRestore` in individual tests.
- The retry budget constant `ATTEMPTS` is a *test-side* copy. If the production budget changes, this file will fail (it asserts `toHaveBeenCalledTimes(ATTEMPTS)`), which is intentional but easy to miss when only updating the production file.
- The "miss" scenario simulates `findOneAndUpdate` returning `null` (filter matched no document) rather than throwing; this exercises a *different* retry path inside `upsertLine` than the duplicate-key path.
