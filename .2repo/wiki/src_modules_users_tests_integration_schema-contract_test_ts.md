# src/modules/users/tests/integration/schema-contract.test.ts

## Purpose

Integration tests that verify Mongoose **schema-level** behaviours (`select: false`, password hashing, serialisation shape, and the `unique` index) against a real MongoDB instance. They exist to pin down guarantees that live in the model declaration itself—not in application code—so a schema edit can't silently remove a security or data-integrity invariant.

## Key elements

- **`describe('user schema', …)`** — single suite, five cases:
  - *Hides password & tokens from ordinary read* — asserts `findById` returns `undefined` (not `[]`/`''`) for `password` and `tokens`, confirming `select: false`.
  - *Exposes credentials only through the explicit selector* — `findByIdWithCredentials` returns a bcrypt string for `password`.
  - *Hashes the password rather than storing it verbatim* — verifies the stored value matches the bcrypt prefix regex `^\$2[aby]\$`.
  - *Serialises to id, never `_id`, `__v`, `password`, or `tokens`* — checks the `toJSON()` output shape.
  - *Enforces email uniqueness at the database level* — expects a duplicate insert to reject with an `e11000` / duplicate-key error.

## Relationships

- **`src/modules/users/index.ts`** — re-exports `userRepository`, which this file imports for `findById` and `findByIdWithCredentials`.
- **`src/modules/users/repository.ts`** — implements the repository methods exercised here; the tests are its contract at the schema level.
- **`src/modules/users/tests/fixtures.ts`** — provides the `createUser` factory used to seed documents before each assertion.
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb()`, called once before the suite to connect a real (or in-memory) MongoDB and clean it.

## Notes

- Runs against a **real** Mongo connection on purpose; the doc comment explains that a mocked model would only assert the mock's opinion of `default`/`select`, not Mongoose's actual behaviour.
- The uniqueness test is a **fast guard** for the `unique` index. The full concurrency race (two simultaneous signups) is covered in `tests/integration/concurrency/auth-races.test.ts`; this file only ensures the index still exists.
- The `tokens` assertion uses `toBeUndefined()` (field absent) rather than `toEqual([])`, deliberately asserting the stronger "never selected" guarantee.
