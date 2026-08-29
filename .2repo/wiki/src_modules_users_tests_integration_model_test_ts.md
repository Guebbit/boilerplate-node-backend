# src/modules/users/tests/integration/model.test.ts

## Purpose

Integration test that verifies user credentials (bcrypt hash, refresh tokens) can never appear in any API response body. It exercises two independent safeguard mechanisms—`select: false` on the Mongoose schema and the `applyUserTransform` (`toJSON`) allowlist—and asserts that the serialized output matches the OpenAPI `User` contract exactly. Both mechanisms are tested because a regression in one could be masked by the other.

## Key elements

- **`expectNoCredentials(payload)`** — Helper that serialises a value to JSON and asserts it contains none of the strings `'password'`, `'tokens'`, or `'$2b$'` (bcrypt prefix). Applied to both single documents and list results.
- **`withTokens()`** — Creates a user via the factory with one `TokenType.REFRESH` token, giving every test a realistic credential payload to leak.
- **`describe('select: false (the safety net)')`** — Four tests confirming `findById`, `findOne`, and `findAll` (lean) omit `password`/`tokens`, while `findByIdWithCredentials` still returns them.
- **`describe('applyUserTransform (the contract boundary)')`** — Tests that `toJSON()` strips credentials even from a document that holds them, replaces `_id`/`__v` with the contract `id`, emits exactly the OpenAPI key set (`active`, `admin`, `createdAt`, `email`, `id`, `imageUrl`, `locale`, `updatedAt`, `username`, `verified`), preserves `active` independently of `deletedAt` (all four combinations), defaults `active` to `true`, exposes `deletedAt` only when set, and that `userService.search` / `getById` produce the same clean shape from lean and non-lean paths respectively.

## Relationships

- **`src/modules/users/model.ts`** — The subject under test: its `select: false` flags and `toJSON` transform (`applyUserTransform`) are the two mechanisms being asserted.
- **`src/modules/users/repository.ts`** — Imports `userRepository`; tests call `findById`, `findOne`, `findAll`, and `findByIdWithCredentials` directly.
- **`src/modules/users/service.ts`** — Imports `userService`; tests call `search({})` (lean list path) and `getById(id)` (single-lookup path).
- **`src/modules/users/index.ts`** — Barrel re-export used to import `userRepository` and `TokenType` without reaching into deeper paths.
- **`src/modules/users/tests/factory.ts`** — Provides `createUser`, the sole means of seeding users in these tests.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module top-level to point Mongoose at the in-memory test database.
- **`tests/support/stub.ts`** — `asStub<T>()` is used to cast `items[0]` to a typed shape for the id-format assertion.

## Notes

- The two mechanisms are deliberately tested in separate `describe` blocks so a regression is attributable to one specific layer.
- The lean list path (`findAll` → `userService.search`) bypasses `toJSON` entirely; the transform is applied manually in the service, and this file is the regression guard for that manual mapping.
- `active` and `deletedAt` are independent fields (not derived from each other). The four-combination test exists to prevent someone from collapsing them into a single boolean.
- `locale` and `verified` are intentionally public (client-visible) and included in the allowed key list—do not remove them when tightening the contract.
- The `deletedAt` key is absent from the serialised output when the user has not been soft-deleted; it is not emitted as `null`/`undefined`.
