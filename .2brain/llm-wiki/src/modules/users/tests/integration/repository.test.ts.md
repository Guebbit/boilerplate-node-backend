---
source: src/modules/users/tests/integration/repository.test.ts
sha256: 2c54272aa7eceb60a07bdad7c3449666a000d76f5d01d61a416997f85233717e
generated_at: 2026-09-23T19:35:32.172915+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/repository.test.ts

## Purpose

Integration test suite for `userRepository` that exercises the full CRUD surface (create, findById, findOne, findAll, count, save, deleteOne, updateMany) plus the token-facing methods (`tokenRemoveAll`, `tokenRemoveExpired`) against an in-memory MongoDB instance. It verifies repository-level behavior—persistence semantics, lean vs. hydrated documents, pagination options, and token lifecycle—without depending on an external database.

## Key elements

- **`setupTestDb()`** — called once at module scope; wires up an in-memory Mongo that all suites share.
- **`describe('create')`** — confirms the pre-save hook hashes the password and the returned document carries a generated `_id`.
- **`describe('findById')` / `describe('findOne')`** — happy-path retrieval and the `null` return on miss.
- **`describe('findAll')`** — validates filter, `limit`, `skip` options, and that results are **lean** plain-JS objects (no Mongoose `save`).
- **`describe('count')`** — total and filtered document counts; returns `0` on empty collection.
- **`describe('save')`** — flushes in-memory Mongoose mutations back to the database.
- **`describe('deleteOne')` / `describe('updateMany')`** — destructive removal and batch `$set` updates with filter isolation.
- **`describe('token methods')`** — exercises `tokenRemoveAll` (by type) and `tokenRemoveExpired` (expiration + `supersededAt` grace-window sweep). Fixtures seed tokens via `hashToken(...)` to mirror production's at-rest format.

## Relationships

- **`src/modules/users/repository.ts`** — the system under test; imports `userRepository`.
- **`src/modules/users/model.ts`** — imports `TokenType`, `hashToken`, the `UserDocument` type, and `userModel as Users` (direct path, not barrel, since no sibling module re-exports it).
- **`src/modules/users/tests/factories.ts`** — provides `makeUser`, `createUser`, and `PLAIN_PASSWORD` for test fixtures.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the in-memory Mongo used by every test.
- **`tests/support/stub.ts`** — `asStub` is used to type-narrow a lean object and assert absence of Mongoose instance methods.

## Notes

- Tokens in fixtures are **always** stored via `hashToken(...)`; a plain-text seed would describe a document shape production never writes.
- `tokenRemoveExpired` returns a **count** (number removed), not a status code—the service layer owns the response semantics.
- The `supersededAt` grace-window test is critical: a rotated-out token keeps its original `expiration` (up to a year for `remember: long`), so the sweep must also clear tokens whose `supersededAt` is older than the grace window, while preserving those still within it.
- The direct `@modules/users/model` import bypasses the barrel file intentionally; `eslint-plugin-boundaries` permits a spec reaching into its own module's internals.
