# src/modules/users/tests/integration/schema-contract.test.ts

## Purpose

Integration test that pins the **declarative schema contract** of the User Mongoose model — defaults, `select: false`, `required`, unique index, and `toJSON` shape — against a real MongoDB instance. It exists because these guarantees live in schema options, not in repository logic, and no other spec asserts them.

## Key elements

- **`describe('user schema', …)`** — single suite, six cases:
  - *hides password and tokens from an ordinary read* — asserts `findById` returns `undefined` (not `null`/empty) for `password` and `tokens`.
  - *exposes credentials only through the explicit selector* — asserts `findByIdWithCredentials` returns a `String` password.
  - *hashes the password rather than storing it verbatim* — matches the `^\$2[aby]\$` bcrypt prefix.
  - *defaults admin to false* — creates a user without `admin` and expects `false`.
  - *serialises to id, never _id, __v, password or tokens* — inspects the `toJSON()` output shape.
  - *enforces email uniqueness at the database level* — expects an `E11000` / duplicate-key error on a second insert with the same email.

## Relationships

- **`src/modules/users/index.ts`** — imported as `@modules/users`; provides the `userRepository` under test.
- **`src/modules/users/repository.ts`** — source of `userRepository` methods called here (`findById`, `findByIdWithCredentials`, `create`).
- **`src/modules/users/tests/factory.ts`** — imported as `@modules/users/tests/factory`; supplies `createUser` which builds and persists a user in the test DB.
- **`tests/support/setup-test-db.ts`** — imported as `@tests/setup-test-db`; `setupTestDb()` spins up (and tears down) a real MongoDB instance for the suite.

## Notes

- Uses a **real MongoDB** (via `setupTestDb`) rather than a mocked Mongoose model, because the assertions target Mongoose's own handling of `default`, `select`, `unique`, and `toJSON` — a mock would only assert the mock's interpretation.
- The email-uniqueness test is deliberately **not** a concurrency test; it pins the index constraint that the separate `tests/integration/concurrency/auth-races.test.ts` race scenario depends on. If a schema edit drops `unique`, this file fails deterministically instead of a timing-dependent test.
- The `password` assertion after creation uses the literal `'Password1!'` — this is the factory's known default, not a value the test chose. Changing the factory's default password without updating this assertion will break the hash test.
- The `as never` cast in the `admin` default test acknowledges that the full `create` signature (likely requiring more fields) is intentionally bypassed to isolate the default behaviour.
