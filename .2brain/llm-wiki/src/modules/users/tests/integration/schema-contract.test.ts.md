---
source: src/modules/users/tests/integration/schema-contract.test.ts
sha256: e508dfb3abb20b487486dda9504db93c8199cd8b9c94de90a3705f9de5205ced
generated_at: 2026-09-23T19:35:41.818985+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/schema-contract.test.ts

## Purpose

Integration tests that verify Mongoose schema-level guarantees (field visibility via `select: false`, password hashing, JSON serialization shape, and the unique email index) by running against a real MongoDB instance. These test Mongoose's own built-in behaviours rather than application-level transforms, so a mocked model would be meaningless.

## Key elements

- **`describe('user schema')`** — single suite containing five assertions:
    - _hides password and tokens from an ordinary read_ — confirms `select: false` means `findById` returns `undefined` (not an empty array) for `password` and `tokens`.
    - _exposes credentials only through the explicit selector_ — confirms `findByIdWithCredentials` returns the hashed password string.
    - _hashes the password rather than storing it verbatim_ — asserts the stored value matches the bcrypt prefix `^\$2[aby]\$` and differs from `PLAIN_PASSWORD`.
    - _serialises to id, never \_id, \_\_v, password or tokens_ — pins the `toJSON()` output shape (virtual `id`, absence of Mongoose internals and sensitive fields).
    - _enforces email uniqueness at the database level_ — inserts a duplicate email and expects a Mongo `E11000` duplicate-key error; acts as a fast-fail guard for the unique index that `auth-races.test.ts` depends on.

## Relationships

- **`src/modules/users/repository.ts`** — provides `userRepository.findById` and `userRepository.findByIdWithCredentials`, the two read paths under test.
- **`src/modules/users/tests/factories.ts`** — supplies `createUser` (creates a document with a known email) and `PLAIN_PASSWORD` (the unhashed input to compare against the stored hash).
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called once at module load to connect to (and clean) a real Mongo instance before the suite runs.

## Notes

- **Real Mongo, not a mock.** The file header explicitly states a mocked model would only assert the mock's opinion of `default`/`select`; the point is to catch schema drift (e.g., someone removing `select: false` or the unique index).
- **`tokens` is expected to be `undefined`, not `[]`.** The test comments that "never selected" is a stronger guarantee than "selected but blank" because there is nothing to accidentally serialise.
- **Email-unique test is a guard, not the race test.** The actual concurrency race lives in `tests/integration/concurrency/auth-races.test.ts`; this case simply fails early if a schema edit quietly drops the `unique` index.
- **bcrypt format assertion is prefix-only** (`^\$2[aby]\$`). It does not pin a specific cost factor, so changing the work factor won't break this test.
