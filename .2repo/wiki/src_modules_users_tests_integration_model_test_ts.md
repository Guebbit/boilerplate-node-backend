# src/modules/users/tests/integration/model.test.ts

## Purpose

Integration test that verifies user credentials (bcrypt password hash, live tokens) can never leak into a serialized API response. It asserts two independent guards: Mongoose `select: false` prevents the fields from loading in normal queries, and `applyUserTransform`'s allowlist strips them again at serialization time — including on `.lean()` results that bypass `toJSON`.

## Key elements

- **`expectNoCredentials(payload)`** – Shared guard that JSON-stringifies a payload and asserts it contains no `password`, `tokens`, or bcrypt prefix (`$2b$`).
- **`withTokens()`** – Seeds a user via `createUser` with one live `REFRESH` token so tests can verify token stripping.
- **`describe('select: false (the safety net)')`** – Confirms `findById`, `findOne`, `findAll` (lean) omit password/tokens, while `findByIdWithCredentials` intentionally still returns them.
- **`describe('applyUserTransform (the contract boundary)')`** – Verifies `toJSON()` output: strips credentials, replaces `_id`/`__v` with `id`, emits exactly the OpenAPI `User` key set, keeps `active` independent of `deletedAt`, defaults `active` to `true`, and works correctly through `userService.search` (lean list) and `userService.getById`.

## Relationships

- **`src/modules/users/index.ts`** – Source of `userRepository` and `TokenType` enum used throughout.
- **`src/modules/users/repository.ts`** – The finders under test (`findById`, `findOne`, `findAll`, `findByIdWithCredentials`); the `select: false` guard lives here.
- **`src/modules/users/service.ts`** – `search` and `getById` are exercised to confirm the transform applies on lean paths.
- **`src/modules/users/model.ts`** – Owns the schema definition (`select: false` fields) and the `toJSON` / `applyUserTransform` serialization logic that is the primary subject of the second suite.
- **`src/modules/users/tests/fixtures.ts`** – Provides `createUser` for seeding documents with specific field values.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` called once before all suites to provision the in-memory DB.
- **`tests/support/stub.ts`** – `asStub` used to type-cast items from `userService.search` for assertions.

## Notes

- The `.lean()` path (via `findAll` and `userService.search`) bypasses Mongoose's `toJSON`, so the transform must operate on plain objects. Tests explicitly cover this.
- `active` and `deletedAt` are independent fields by design; the test asserts all four combinations serialize correctly and that `active` is not derived from `deletedAt`.
- `locale` and `verified` appear in the allowlist (intentionally public, per the OpenAPI `User` contract) despite looking internal.
- The test asserts an **exact** sorted key list for the serialized `User` object, making it a contract-boundary test: adding a field to the transform without updating this list (and the OpenAPI spec) will break the build.
