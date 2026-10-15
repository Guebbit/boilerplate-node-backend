---
source: src/modules/users/tests/integration/repository.test.ts
sha256: 1ef22ec03aa1074628dfbcb7bd13b2d742cf6d7d3149b719e3fd2b8f717dfd5f
generated_at: 2026-10-15T12:14:50.731845+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/repository.test.ts

## Purpose

Integration test suite for `userRepository`, exercising the full CRUD surface plus the `writebackImage` method against an in-memory MongoDB instance. It verifies both happy paths and edge cases (null returns, pagination options, filter behavior, password hashing, idempotent image write-back) so that the repository contract is pinned before any consumer depends on it.

## Key elements

- **`describe('userRepository', …)`** — top-level block covering every public method of the repository factory.
- **`create`** — asserts insertion, returned Mongoose document shape, and that the pre-save hook replaces the plain password with a hash.
- **`findById` / `findOne`** — happy-path retrieval and the `null` contract for missing documents.
- **`findAll`** — no-filter, `limit`, `skip`, filter-based, and **lean-object** assertions (via `asStub` to confirm absence of Mongoose `save`).
- **`count`** — unfiltered, filtered, and empty-collection cases.
- **`save`** — flushes in-memory Mongoose mutations back to the database.
- **`deleteOne`** — permanent removal confirmed by a subsequent `findById → null`.
- **`updateMany`** — bulk `$set` on matching docs; non-matching docs left untouched.
- **`writebackImage`** — three sub-cases: successful key match, duplicate (idempotent) run returning `true`, and stale key mismatch returning `false`.

## Relationships

- **`src/modules/users/repository.ts`** — the system under test; `userRepository` is the sole object under assertion.
- **`src/modules/users/model.ts`** — imported directly as `userModel` (aliased `Users`) to bypass the barrel; used only inside `writebackImage` tests to set `pendingImageKey` on a document before invoking the write-back.
- **`src/modules/users/tests/factories.ts`** — provides `makeUser`, `createUser`, and the `PLAIN_PASSWORD` constant used across every test that creates a user.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called once at module scope, wiring the in-memory Mongo connection before any test runs.
- **`tests/support/stub.ts`** — `asStub<T>()` is a type-only cast helper used to assert the *absence* of a property (`save`) on lean objects.
- **`src/modules/users/factories.ts`** — listed as a graph neighbor but not directly imported here; the test uses the module-local test factory instead.

## Notes

- `setupTestDb()` is invoked **outside** the `describe` block (module-level side-effect). It must run before the first test; reordering imports or moving it inside a `beforeAll` would change timing.
- The `userModel` import deliberately bypasses the module barrel. The in-file comment notes that `eslint-plugin-boundaries` permits a spec to reach its own module's internals, so this is intentional, not a lint exception.
- `asStub` is a pure type-cast (no runtime logic); it exists solely to satisfy the TypeScript compiler when asserting `undefined` on an optional property. Do not confuse it with a mocking utility.
- The `writebackImage` tests mutate `pendingImageKey` directly via `Users.updateOne` because no repository method sets that field — it is expected to be written by an upstream image-digestion job.
