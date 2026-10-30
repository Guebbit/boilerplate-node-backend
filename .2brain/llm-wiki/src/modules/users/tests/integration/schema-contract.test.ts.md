---
source: src/modules/users/tests/integration/schema-contract.test.ts
sha256: a862341607288435d81dd161af6c493c1c0c40cc0248cf22df1786b96a30f5a7
generated_at: 2026-10-29T06:22:42.415286+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/schema-contract.test.ts

## Purpose

Integration test that verifies the **declarations** of the user Mongoose schema — `select: false` on credentials, password hashing, serialization shape, and the `unique` email index — against a real MongoDB instance. These are Mongoose-level behaviors (not application logic), so a mocked model would only assert the mock's opinion and provide no real coverage.

## Key elements

- **`setupTestDb()`** — boots a real Mongo instance for the suite (called once, outside the `describe`).
- **`describe('user schema')`** — five cases:
  - *hides password from ordinary read* — confirms `findById` never returns `password` (`select: false`).
  - *exposes credentials only through explicit selector* — confirms `findByIdWithCredentials` returns a string password.
  - *hashes the password* — asserts the stored value starts with `$argon2id$`, not just "differs from plaintext."
  - *serialises to id, never `_id`/`__v`/`password`* — checks `toJSON()` output shape.
  - *enforces email uniqueness at DB level* — second insert of same email must reject with an `E11000` / "duplicate key" error.

No named exports; the file is a side-effect test module (`@module`).

## Relationships

- **`src/modules/users/repository.ts`** — imports `userRepository` and exercises its two read paths (`findById` vs. `findByIdWithCredentials`) to prove the `select: false` contract.
- **`src/modules/users/tests/factories.ts`** — imports `createUser` (to insert documents) and `PLAIN_PASSWORD` (the known plaintext for the hashing assertion).
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb` which provisions and tears down a real Mongo for the suite.

## Notes

- The email-uniqueness test is intentionally a **canary**: it fails fast if a schema edit silently drops the `unique` index. The actual concurrency race (two concurrent signups both passing `findOne` before either inserts) is covered separately in `account/tests/integration/auth-races.test.ts`; this test only pins the index.
- Because the tests target Mongoose's own behaviors, they must run against real Mongo. Do not "fix" slowness by swapping to a mock — that defeats the purpose.
