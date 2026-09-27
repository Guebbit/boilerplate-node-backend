---
source: src/modules/users/tests/integration/repository.test.ts
sha256: d6013f149387d9c8f8e811c1bfcf7240ef92bb83e51f7fac05dfd6455ef23c63
generated_at: 2026-09-27T15:39:52.177033+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/repository.test.ts

## Purpose

Integration test suite for `userRepository`, exercising the full CRUD surface and the token-facing methods (`tokenRemoveAll`, `tokenRemoveExpired`) against an in-memory MongoDB instance. It verifies repository behavior end-to-end (including Mongoose pre-save hooks, lean queries, and pagination options) without requiring a real database.

## Key elements

- **`describe('userRepository')`** — top-level block; each nested `describe` maps to one repository method: `create`, `findById`, `findOne`, `findAll`, `count`, `save`, `deleteOne`, `updateMany`, and the token methods.
- **`setupTestDb()`** (from `@tests/setup-test-db`) — called once at module scope; provisions the in-memory Mongo and resets it between runs.
- **`makeUser` / `createUser` / `PLAIN_PASSWORD`** (from `@modules/users/tests/factories`) — test helpers: `makeUser` builds a plain object, `createUser` persists one via the repository, `PLAIN_PASSWORD` is the known-plaintext constant used to assert hashing.
- **`userRepository`** (from `../../repository`) — the SUT; every assertion targets its returned values or side-effects.
- **`TokenType`, `hashToken`, `userModel`** (from `../../model`) — token constants, the hashing utility used to seed realistic token fixtures, and the raw Mongoose model (imported directly, bypassing the barrel, per the `eslint-plugin-boundaries` allowance for intra-module access).
- **`asStub`** (from `@tests/stub`) — type-cast helper used in the "returns lean objects" assertion to check for absence of Mongoose methods.

## Relationships

- **`src/modules/users/repository.ts`** — the module under test; the suite imports `userRepository` and asserts every public method.
- **`src/modules/users/model.ts`** — provides `TokenType`, `hashToken`, and `userModel`; the suite uses these to seed token fixtures and to reference the schema directly.
- **`src/modules/users/tests/factories.ts`** — supplies `makeUser`, `createUser`, and `PLAIN_PASSWORD`, the primary data fixtures for every test case.
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb`, which wires up the in-memory MongoDB that all tests run against.
- **`tests/support/stub.ts`** — provides `asStub`, a type-safe cast utility used to assert on object shape (e.g., absence of `.save`).

## Notes

- Token fixtures seed `hashToken(...)` explicitly rather than going through a `tokenAdd` helper, because tokens are always hashed at rest; a plaintext seed would not mirror what production writes.
- `findAll` is expected to return **lean** (plain JS) objects, not Mongoose documents — the suite asserts `typeof user.save === 'undefined'` to lock that in.
- `tokenRemoveExpired` returns a **count** of removed tokens, not a status code; the test asserts the numeric return and then re-reads the document to verify the surviving token.
- The "superseded past grace window" test (truncated in the file) confirms that rotated-away tokens with a long `expiration` are still swept once their `supersededAt` falls outside the grace window, while freshly rotated ones are kept.
- The direct import of `userModel` from `@modules/users/model` (rather than the barrel) is intentional and sanctioned by `eslint-plugin-boundaries` for same-module specs.
