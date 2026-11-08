---
source: src/modules/users/tests/integration/repository.test.ts
sha256: 1ef22ec03aa1074628dfbcb7bd13b2d742cf6d7d3149b719e3fd2b8f717dfd5f
generated_at: 2026-11-08T08:56:23.364268+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/repository.test.ts

## Purpose

Integration test suite for `userRepository`, exercising the full CRUD surface and the module-specific `writebackImage` method against a real (in-memory) MongoDB instance provided by `setupTestDb`. It validates persistence semantics, filtering, pagination, bulk updates, and the image-digest writeback protocol end-to-end.

## Key elements

- **`setupTestDb()`** (module-level call) — boots the in-memory Mongo that every test in the file shares.
- **`create`** — verifies insertion, returned Mongoose document shape, and that the pre-save hook hashes the password.
- **`findById` / `findOne`** — happy-path retrieval and `null` on miss.
- **`findAll`** — unfiltered listing, `limit`, `skip` (cursor pagination), query filtering, and that results are **lean** (plain JS objects, confirmed via `asStub` absence of `save`).
- **`count`** — total and filtered document counts; empty-collection edge case.
- **`save`** — flushes in-memory Mongoose mutations back to the DB.
- **`deleteOne`** — permanent removal; subsequent `findById` returns `null`.
- **`updateMany`** — bulk `$set` with filter; confirms non-matching documents are untouched.
- **`writebackImage`** — the token/optimistic-concurrency protocol: returns `true` on a matching `pendingImageKey` (idempotent on duplicate calls) and `false` when the document's key has advanced (stale job).

## Relationships

- **`src/modules/users/repository.ts`** — the system under test; imports the `userRepository` instance.
- **`src/modules/users/model.ts`** — imports `userModel` (aliased `Users`) *directly*, bypassing the barrel, solely to seed `pendingImageKey` in `writebackImage` tests.
- **`src/modules/users/tests/factories.ts`** — supplies `makeUser`, `createUser`, and the `PLAIN_PASSWORD` constant.
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb` (in-memory Mongo lifecycle).
- **`tests/support/stub.ts`** — provides `asStub` for type-cast assertions (used to assert absence of Mongoose methods).

## Notes

- `findAll` returns **lean** objects while `create`, `findById`, `findOne`, and `save` return full Mongoose documents. Tests explicitly distinguish these (the `save` test mutates a Mongoose doc; the `findAll` lean test checks for missing `save`).
- `userModel` is imported from `@modules/users/model` rather than the barrel export. The inline comment notes this is intentional: a spec is allowed to reach into its own module's internals per `eslint-plugin-boundaries`.
- `writebackImage` tests set `pendingImageKey` via a raw `Users.updateOne` call (not through the repository) to simulate the intermediate state a background digest job would leave behind.
- `setupTestDb()` runs once at module scope; individual tests do **not** reset the collection, so `findAll`/`count` tests that expect exact counts rely on ordering and the fact that earlier suites' documents are still present (e.g., `count` "returns 0 when empty" passes only because it runs in a fresh describe block after other tests have already inserted rows — the assertion is actually against the *current* collection state, not a guaranteed empty state).
