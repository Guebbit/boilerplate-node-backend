---
source: src/modules/users/tests/integration/schema-contract.test.ts
sha256: a862341607288435d81dd161af6c493c1c0c40cc0248cf22df1786b96a30f5a7
generated_at: 2026-11-08T08:56:46.537657+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/schema-contract.test.ts

## Purpose

Integration test that pins down **Mongoose schema-level guarantees** — `select: false` on credentials, password hashing, `toJSON` virtuals, and the unique email index — by running them against a real MongoDB instance. It exists because these are database-engine behaviours, not application logic; a mocked model would only confirm the mock's own defaults.

## Key elements

- **`describe('user schema')`** — single suite, five cases, no nested blocks.
- **Password hidden on plain read** — asserts `findById` returns `password === undefined` (validates `select: false`).
- **Credentials via explicit selector** — asserts `findByIdWithCredentials` returns a string password.
- **Password hashing** — asserts the stored value is *not* `PLAIN_PASSWORD` and matches the `$argon2id$` prefix, distinguishing a real hash from an arbitrary string.
- **`toJSON` shape** — asserts the virtual serialises `id` (string) and omits `_id`, `__v`, and `password`.
- **Email uniqueness (e11000)** — inserts the same email twice and expects a duplicate-key rejection; guards the unique index that a signup concurrency race depends on.

## Relationships

- **`src/modules/users/repository.ts`** — `userRepository.findById` and `userRepository.findByIdWithCredentials` are the read paths under test.
- **`src/modules/users/tests/factories.ts`** — `createUser` inserts documents; `PLAIN_PASSWORD` is the known-plaintext used to verify hashing.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` (called at module top-level) provisions and tears down a real Mongo instance for the suite.

## Notes

- `setupTestDb()` is invoked at **module scope**, not inside a `beforeAll`; the file relies on its side-effect to be active before any `it` runs.
- The email-uniqueness case is deliberately a *guard*, not a race test. The actual concurrent-signup scenario lives in `account/tests/integration/auth-races.test.ts`; this case simply fails fast if a schema edit silently drops `unique`.
- The file is annotated with `@module` and a block comment explaining *why* real Mongo is required — useful context when considering refactors toward in-memory fakes.
