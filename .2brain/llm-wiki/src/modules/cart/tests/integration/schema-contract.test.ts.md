---
source: src/modules/cart/tests/integration/schema-contract.test.ts
sha256: 17ccab8387ac0d25c7ec1a083ecc60477845eb153d56f74afdc32fdcf8a237eb
generated_at: 2026-09-27T14:47:47.439172+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/schema-contract.test.ts

## Purpose

Integration test that verifies schema-level guarantees (unique index, defaults, `required`, `select: false`) against a real MongoDB instance. It exists because these are Mongoose/Mongo behaviours—not application logic—and a mock would only assert its own opinion rather than the actual schema contract.

## Key elements

- **`setupTestDb()`** — called once at module load; spins up a real MongoDB instance for the suite.
- **`describe('cart schema')`** — the test block; currently contains a single assertion.
- **`it('refuses a second cart for the same user')`** — creates a user, writes one cart via the repository, calls `cartModel.syncIndexes()`, then asserts that a second `cartRepository.create` with the same `userId` rejects. Verifies the unique index is enforced by the database, not by application code.

## Relationships

- **`src/modules/cart/model.ts`** — imports `cartModel` solely to call `syncIndexes()`, ensuring the unique index on `userId` is materialised before the duplicate-insert assertion.
- **`src/modules/cart/repository.ts`** — imports `cartRepository`; both `create` calls go through it so the test exercises the real write path (validation, hooks) rather than raw model saves.
- **`src/modules/users/tests/factories.ts`** — imports `createUser` to obtain a valid `userId` without hand-crafting a user document.
- **`tests/support/setup-test-db.ts`** — imports `setupTestDb` to provision and tear down the shared test database.

## Notes

- `syncIndexes()` is called explicitly inside the test. Mongoose does not guarantee indexes exist in every CI environment, so this makes the test self-contained without relying on a separate migration step.
- The file deliberately does **not** test transforms, defaults, or `select: false` in its current single assertion—those are covered by sibling specs referenced in the module doc-comment. The structure is in place for them.
- Because it uses a real Mongo, it is slower than unit tests and requires the test-db infrastructure to be available.
