---
source: src/modules/cart/tests/integration/schema-contract.test.ts
sha256: 17ccab8387ac0d25c7ec1a083ecc60477845eb153d56f74afdc32fdcf8a237eb
generated_at: 2026-11-08T05:22:37.100979+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/schema-contract.test.ts

## Purpose

Integration test for the **schema-level declarations** on the cart Mongoose model — `required` constraints, default values, and `select: false` fields — as opposed to the transform logic covered by sibling specs. It runs against a real MongoDB instance because these are Mongoose-native behaviours (index enforcement, field exclusion) that a mock would only assert its own opinion about.

## Key elements

- **`describe('cart schema')`** — top-level suite; currently contains a single test case.
- **`refuses a second cart for the same user`** — asserts the unique index on `userId` rejects a duplicate insert. Calls `cartModel.syncIndexes()` first to guarantee the index is materialised, then expects `cartRepository.create({ userId })` to throw.
- **`setupTestDb()`** (module-level) — spins up a real MongoDB instance for the entire file.

## Relationships

- **`src/modules/cart/model.ts`** — imports `cartModel` solely to call `syncIndexes()`, ensuring the unique index exists before the assertion.
- **`src/modules/cart/repository.ts`** — imports `cartRepository` as the write path under test (`create`); the test exercises the repository rather than the model directly, mirroring how application code performs writes.
- **`src/modules/users/tests/factories.ts`** — imports `createUser` to produce a valid user document so the cart's `userId` references a real `_id`.
- **`tests/support/setup-test-db.ts`** — imports `setupTestDb` to provision and tear down the test database for the file.

## Notes

- The file's docstring describes a broader scope (defaults, `required`, `select: false`), but the single test currently present only covers the **unique index** constraint. Additional cases for the other declaration categories are implied but not yet written.
- `syncIndexes()` is called explicitly; in CI environments where Mongoose auto-indexing may be disabled, omitting it would make the unique-index test silently pass.
- The test intentionally goes through `cartRepository` (not `cartModel.create`) so it also validates that the repository's write path does not strip the constraint.
