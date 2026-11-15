---
source: src/modules/users/tests/integration/model.test.ts
sha256: 41022d65d443c4f536a3bd4125776687cb577652f98cb94eef4699058b047319
generated_at: 2026-11-14T22:35:50.178091+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/model.test.ts

## Purpose

Integration tests that lock down two invariants of the user model: (1) email is stored and matched case-insensitively, and (2) credential data (password hash) can never appear in a serialised response, regardless of whether the document was loaded with `select: false` or retrieved via a `*WithCredentials` finder. A secondary concern is that `toJSON()` emits exactly the OpenAPI `User` contract properties and nothing else.

## Key elements

- **`expectNoCredentials(payload)`** — Asserts `JSON.stringify(payload)` contains neither the literal string `"password"` nor the bcrypt prefix `"$2b$"`. Used as a universal guard on every serialisation path.
- **`withCredentials()`** — Shorthand for `createUser()`; documents that the seeded user *does* carry a password hash.
- **`describe("email is case-insensitive")`** — Three tests: lowercasing on write, the login path matching a differently-cased input, and the unique index rejecting a case-only duplicate.
- **`describe("select: false (the safety net)")`** — Verifies `findById`, `findOne`, and `findAll` (lean) omit `password`, while `findByIdWithCredentials` deliberately returns it.
- **`describe("applyUserTransform (the contract boundary)")`** — Verifies `toJSON()` strips credentials even from a credentials-carrying document, maps `_id` → `id`, drops `__v`, emits only the `BASE_PROPERTIES` list (plus `verifiedAt` when set), keeps `active` independent of `deletedAt`, defaults `active` to `true`, exposes `deletedAt` on soft-deleted rows, and that the service-layer lookups produce the same contract-shaped output.
- **`BASE_PROPERTIES`** — Local constant listing the exact keys the OpenAPI `User` contract expects: `active`, `createdAt`, `email`, `id`, `locale`, `updatedAt`, `username`.

## Relationships

- **`src/modules/users/repository.ts`** — Imports `userRepository`; the primary SUT for the `select: false` and `*WithCredentials` tests.
- **`src/modules/users/services/index.ts`** — Imports `userService`; exercised to confirm the service layer applies the same transform and emits contract-shaped JSON.
- **`src/modules/users/friends/account.ts`** — Imports `accountUserService`; used to verify the login path performs a case-insensitive email lookup.
- **`src/modules/users/tests/factories.ts`** — Imports `createUser`; seeds every fixture and accepts partial overrides (email, `verifiedAt`, `active`, `deletedAt`).
- **`tests/support/setup-test-db.ts`** — Imports and invokes `setupTestDb()` at module top level to provision the integration database.
- **`tests/support/stub.ts`** — Imports `asStub`; provides a typed cast for list-item access in the service-layer test.

## Notes

- `setupTestDb()` runs at **module load time** (top-level call), not inside a `beforeAll` hook. Ensure the test runner awaits it before any `describe` block executes.
- The `it.each` test that asserts the exact key set will **fail if a new field is added to the schema** without either (a) updating `BASE_PROPERTIES` here or (b) adding it to `applyUserTransform`'s allowlist. Keep both in sync.
- `role` is deliberately absent from the user document; the comments note it belongs to `@modules/access` and is passed as a parameter to `presentUser`, not read from the schema.
- `active` and `deletedAt` are independent columns. Do not replace one with a derived value; the test matrix explicitly covers all four combinations.
- `verifiedAt` is **optional** in the output: it appears only when non-null, so the expected-key list is parameterised per state in the `it.each` cases.
- The bcrypt-prefix check (`'$2b$'`) in `expectNoCredentials` catches hash leakage even if the field name were renamed.
