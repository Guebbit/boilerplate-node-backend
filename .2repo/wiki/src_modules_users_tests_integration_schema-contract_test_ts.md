# src/modules/users/tests/integration/schema-contract.test.ts

## Purpose

Integration tests that pin Mongoose schema-level guarantees — `select: false` on credentials, `default` values, the bcrypt hash, the `unique` email index, and `toJSON` serialization shape. They run against a real MongoDB instance because these are Mongoose's own runtime behaviors; a mocked model would only re-assert the mock's opinion, not the actual schema.

## Key elements

- **`describe('user schema')`** — single top-level block containing six focused `it` cases.
- **"hides password and tokens from an ordinary read"** — verifies `findById` returns `undefined` (not `null`/`[]`) for `password` and `tokens`, confirming `select: false` is active.
- **"exposes credentials only through the explicit selector"** — confirms `findByIdWithCredentials` *does* return the hashed password.
- **"hashes the password rather than storing it verbatim"** — asserts the stored value matches `/^\$2[aby]\$/` (bcrypt prefix), not just "differs from input."
- **"defaults admin to false"** — creates a user without `admin` and asserts the field resolves to `false` (privilege-by-omission guard).
- **"serialises to id, never _id, __v, password or tokens"** — checks `toJSON()` output: `id` present as string, `_id`/`__v`/`password`/`tokens` absent.
- **"enforces email uniqueness at the database level"** — expects a duplicate insert to reject with a Mongo `E11000` / "duplicate key" error, pinning the unique index that `authService.signup`'s non-atomic `findOne`-then-insert flow depends on.

## Relationships

- **`src/modules/users/index.ts`** — source of the `userRepository` import (`@modules/users`). The repository methods under test (`findById`, `findByIdWithCredentials`, `create`) are re-exported through this barrel.
- **`src/modules/users/repository.ts`** — not imported directly here; consumed indirectly via the `index.ts` re-export. Its method implementations are what the assertions actually exercise.
- **`src/modules/users/tests/fixtures.ts`** — provides `createUser`, the shared helper that inserts a fully-populated user so each test can focus on a single schema property.
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb()`, called once at module scope to spin up/tear down the dedicated test database for these integration tests.

## Notes

- **Real Mongo, no mocks.** The file header explicitly states the rationale: `default`, `select: false`, and the unique index are Mongoose/Mongo behaviors that a Jest mock would simulate rather than exercise.
- **`undefined` vs. empty array.** The `select: false` assertion deliberately checks `toBeUndefined()` — a stronger guarantee than "selected but blank," since an unselected field has nothing to accidentally serialise.
- **`as never` cast** on the `create` call in the admin test: the fixture's `createUser` likely includes fields (e.g. `tokens`) that this minimal literal omits, so the cast silences a type mismatch that is intentional here.
- **Email-uniqueness test is a safety net, not a race test.** The actual concurrency scenario lives in `tests/integration/concurrency/auth-races.test.ts`; this case only ensures a schema edit that drops `unique` is caught immediately.
- **bcrypt prefix regex** (`$2[aby]$`) matches both legacy and modern bcrypt salt versions. If the project ever migrates to a different KDF, this assertion must be updated in lockstep.
