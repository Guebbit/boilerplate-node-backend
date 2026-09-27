---
source: src/modules/users/tests/integration/model.test.ts
sha256: 3841d51be00672d5b51d7607046fa820b44a02e20de51e955025adad3da0ccef
generated_at: 2026-09-27T15:39:40.452869+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/model.test.ts

## Purpose

Integration test that verifies two invariants of the user model: (1) email addresses are stored and looked up case-insensitively via a unique index, and (2) credential fields (`password`, `tokens`) can never leak into a serialised response. The second invariant is checked at two independent layers — Mongoose `select: false` at the query level and the `toJSON` allowlist at the serialisation boundary — including `.lean()` results that bypass `toJSON` entirely.

## Key elements

- **`expectNoCredentials(payload)`** — Assertion helper that JSON-serialises an arbitrary payload and fails if the strings `password`, `tokens`, or the bcrypt prefix `$2b$` appear. Used by nearly every "no-leak" test.
- **`withTokens()`** — Factory wrapper around `createUser` that seeds a user with one live `TokenType.REFRESH` token, giving tests a realistic secret to attempt to leak.
- **`describe('email is case-insensitive (B5)')`** — Four cases covering lowercased storage, cross-case `findForLogin`, unique-index rejection of case-differing duplicates, and direct `normalizeEmail` behaviour.
- **`describe('select: false (the safety net)')`** — Verifies that `findById`, `findOne`, and `findAll` (lean) omit `password`/`tokens`, while the explicit `*WithCredentials` finders still return them.
- **`describe('applyUserTransform (the contract boundary)')`** — Verifies that `toJSON()` strips credentials even from a credential-carrying document, replaces `_id`/`__v` with `id`, emits exactly the OpenAPI `User` key set (sorted, asserted via `toSorted()`), keeps `active` and `deletedAt` as independent fields, defaults `active` to `true`, exposes `deletedAt` on soft-deleted accounts, and normalises both lean lists (`userService.search`) and single lookups (`userService.getById`).

## Relationships

- **`src/modules/users/model.ts`** — Source of `TokenType` and `normalizeEmail`, which are exercised directly in the email tests.
- **`src/modules/users/repository.ts`** — Provides `userRepository`; the tests call `findById`, `findOne`, `findAll`, and `findByIdWithCredentials` to confirm the `select: false` guard.
- **`src/modules/users/service.ts`** — Imported both as a namespace (`userService.search`, `userService.getById`) and as a named object (`userServiceObject.findForLogin`); tests verify the service-level serialisation path.
- **`src/modules/users/tests/factories.ts`** — `createUser` is the sole seeding mechanism; the `withTokens` wrapper in this file composes it.
- **`src/infrastructure/persistence/normalize-email.ts`** — Re-exported through `model.ts`; the `normalizeEmail` unit assertion in the B5 block exercises its trim-and-lowercase contract.
- **`tests/support/setup-test-db.ts`** — Called once at module top to spin up an isolated in-memory (or temporary) Mongoose database for every test in this file.
- **`tests/support/stub.ts`** — `asStub` is used to cast `items[0]` from `search` without a full type, letting the test read `.id` safely.

## Notes

- The test file deliberately imports the service **twice** (`import * as userService` and `import { userService as userServiceObject }`) to cover both call styles; this is intentional, not a duplication bug.
- The OpenAPI key list assertion (`toSorted()` equals a hardcoded array) acts as a **closed contract guard**: adding a new field to the user document without updating this test will break CI. `role` is explicitly *absent* by design — it belongs to `@modules/access`.
- `active` and `deletedAt` are tested as **orthogonal** booleans, not as a derived state. The four-combination matrix test is the guard against regressing them into a single tri-state.
- The `expectNoCredentials` helper checks for the literal substring `$2b$` (bcrypt salt prefix) in addition to the key names, catching cases where the hash value leaks even if the field name changes.
