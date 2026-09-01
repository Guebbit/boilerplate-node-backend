# src/modules/users/tests/integration/repository.test.ts

## Purpose

Integration test suite for `userRepository`, exercising every public method (CRUD + token operations) against a real in-memory MongoDB instance wired up by `setupTestDb`. It exists to verify that the repository's Mongoose interactions behave correctly end-to-end—pre-save hooks, lean queries, pagination options, and token sweeps—without relying on mocks for the database layer.

## Key elements

- **`setupTestDb()`** — called once at module top-level to seed and clean the in-memory Mongo before any `describe` block runs.
- **`describe('create')`** — asserts a document is inserted, the pre-save hook hashes the password, and `admin` defaults to `false`.
- **`describe('findById')` / `describe('findOne')`** — happy-path and null-return cases.
- **`describe('findAll')`** — no-filter, `limit`, `skip` (cursor pagination), query filtering, and lean-object guarantee (no Mongoose `save` method via `asStub`).
- **`describe('count')`** — total, filtered, and empty-collection counts.
- **`describe('save')`** — persists in-memory Mongoose mutations back to the DB.
- **`describe('deleteOne')`** — permanent removal; `findById` returns `null` afterward.
- **`describe('updateMany')`** — bulk `$set` on matching docs; non-matching docs untouched.
- **`describe('token methods')`** — `tokenRemoveAll(type)`, `tokenRemoveExpired()` (valid vs. expired sweep, failure-rejection path via a spied `Users.updateMany`), and token-lookup methods (truncated in source).

## Relationships

- **`src/modules/users/index.ts`** — provides the `userRepository` factory, `TokenType` enum, and `UserDocument` type that the tests import and assert against.
- **`src/modules/users/repository.ts`** — the unit under test; every `it` block exercises one of its exported methods.
- **`src/modules/users/model.ts`** — imported directly as `Users`; spied on in the `tokenRemoveExpired` failure test to make `updateMany().exec()` reject.
- **`src/modules/users/tests/fixtures.ts`** — supplies `makeUser()` (plain-object factory) and `createUser()` (inserts via the repository) for every test that needs seed data.
- **`tests/support/setup-test-db.ts`** — boots the in-memory Mongo and calls `setupTestDb()` once at the top of this file.
- **`tests/support/stub.ts`** — provides `asStub<T>()`, used to cast a lean object so the test can assert absence of Mongoose instance methods.
- **`src/modules/users/fixtures.ts`** — listed as a neighbor but not imported here; the test uses the module-local `tests/fixtures.ts` instead.

## Notes

- The direct import of `userModel` from `@modules/users/model` is intentional: the barrel (`index.ts`) no longer re-exports it. A comment in the file notes that `eslint-plugin-boundaries` explicitly permits a spec reaching into its own module's internals.
- `tokenRemoveExpired` is asserted to **reject** on write failure (not resolve a status object). A comment documents that the old contract returned `{ status: 500, success: false }` from a Mongoose static, which conflated persistence with HTTP semantics.
- When stubbing the failure path, the mock must return a **query-like object** with `.exec()` (not a rejected promise), because the repository calls `.exec()` on the returned query. A plain `mockRejectedValue` would throw `"exec is not a function"`.
- The file is truncated in the source snapshot; the `findByToken` / `findByIdWithCredentials` tests are cut off.
