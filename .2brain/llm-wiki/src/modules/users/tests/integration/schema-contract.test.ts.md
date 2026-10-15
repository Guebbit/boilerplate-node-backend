---
source: src/modules/users/tests/integration/schema-contract.test.ts
sha256: b11629e14ff7ae25a145a5bfd121e51479385d502d352d6dceb642eeb40b984c
generated_at: 2026-10-15T12:15:01.056652+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/schema-contract.test.ts

## Purpose

Integration test that pins the **schema declarations** of the user Mongoose model — `select: false` on credentials, pre-save argon2id hashing, `toJSON` transform rules, and the `unique` index on `email`. It runs against a real MongoDB instance because these are Mongoose's own runtime behaviours (defaults, selectors, indexes) that a mocked model would only re-assert against the mock's opinion.

## Key elements

- **`describe('user schema')`** — the suite; five `it` blocks cover the contract:
  - *hides the password from an ordinary read* — asserts `findById` returns `password === undefined` (`select: false`).
  - *exposes credentials only through the explicit selector* — asserts `findByIdWithCredentials` returns a string password.
  - *hashes the password rather than storing it verbatim* — asserts the stored value matches `/^\$argon2id\$/`.
  - *serialises to id, never _id, __v or password* — asserts the `toJSON` output shape.
  - *enforces email uniqueness at the database level* — inserts twice, expects an `e11000` duplicate-key error from the unique index.

## Relationships

- **`src/modules/users/repository.ts`** — exercises `userRepository.findById` and `userRepository.findByIdWithCredentials`, the two read paths that expose (or withhold) the password field.
- **`src/modules/users/tests/factories.ts`** — provides `createUser` (inserts a document through the real schema) and `PLAIN_PASSWORD` (the known input used to verify hashing).
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module load to spin up / connect to the test MongoDB instance the suite depends on.

## Notes

- **Why real Mongo, not mocks:** The doc comment states explicitly that mocking would only assert the mock's view of `default`/`select`, not Mongoose's actual pipeline.
- **Uniqueness test is a concurrency guard:** The application-level check in `authService.signup` is a non-atomic `findOne` → `409` → insert; two racing signups can both pass the lookup. Only the DB-level `unique` index blocks the second write. This test fails fast if a schema edit silently drops that index. The companion `tests/integration/concurrency/auth-races.test.ts` drives the actual race.
- **`setupTestDb()` runs at import time**, not inside `beforeAll` — the suite assumes the connection is ready before the first assertion fires.
