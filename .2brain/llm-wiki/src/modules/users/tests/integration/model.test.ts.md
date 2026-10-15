---
source: src/modules/users/tests/integration/model.test.ts
sha256: f95010dc8dab2f225cd2870606c72d4dbacb57f134a65ee5ad3fe65f203f0733
generated_at: 2026-10-15T12:14:15.217446+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/model.test.ts

## Purpose

Integration test suite (run against a real in-memory DB) that asserts two model-level invariants: credentials never appear in any serialized user payload, and email is treated case-insensitively from write through lookup. It exercises the repository, the service layer, and the `toJSON` transform together so that a regression in any single layer is caught.

## Key elements

- **`expectNoCredentials(payload)`** – Assertion helper: JSON-serializes the payload and fails if it contains the string `"password"` or a bcrypt prefix (`$2b$`). Used as the final gate on every response-shape test.
- **`withCredentials()`** – Shorthand for `createUser()`; seeds a user with a password hash.
- **`describe('email is case-insensitive')`** – Verifies lowercasing on create, case-insensitive `findForLogin`, unique-index rejection of case-duplicate emails, and parity with `normalizeEmail`.
- **`describe('select: false (the safety net)')`** – Confirms `findById`, `findOne`, and `findAll` omit `password`, while `findByIdWithCredentials` still returns it.
- **`describe('applyUserTransform (the contract boundary)')`** – Verifies `toJSON()` strips credentials, `_id`, `__v`; emits exactly the OpenAPI `User` key set; keeps `active` independent of `deletedAt`; defaults `active` to `true`; exposes `deletedAt`; maps lean arrays via `userService.search`; normalizes single lookup via `userService.getById`.

## Relationships

- **`src/modules/users/repository.ts`** – Primary SUT; `findById`, `findOne`, `findAll`, and `findByIdWithCredentials` are called directly to probe the `select: false` guard.
- **`src/modules/users/services/index.ts`** – `findForLogin`, `search`, and `getById` are exercised to confirm the service layer preserves the same invariants (lean mapping, credential stripping, email normalization).
- **`src/infrastructure/persistence/normalize-email.ts`** – `normalizeEmail` is unit-asserted alongside the schema cast to guarantee the two code paths agree on trim + lowercase behavior.
- **`src/modules/users/tests/factories.ts`** – `createUser` is the sole seeding mechanism for all tests in this file.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` is invoked at module scope to provision the in-memory MongoDB instance.
- **`tests/support/stub.ts`** – `asStub` provides a typed cast for asserting on lean (plain-object) results without `any`.

## Notes

- The file imports `userService` in two styles (`import * as userService` and `import { userService as userServiceObject }`) to exercise both namespace and named access paths.
- The `toJSON()` allowlist test hard-codes the expected key set (`active`, `createdAt`, `email`, `id`, `locale`, `updatedAt`, `username`, `verifiedAt`). Adding or removing a field from the `User` DTO will break this test.
- `role` is deliberately **absent** from the user document; it is owned by `@modules/access`. Do not add it here.
- `active` and `deletedAt` are independent booleans/dates, not derivable from each other; the test matrix covers all four combinations.
- The test is integration-level (real Mongoose + in-memory DB), not a unit test with mocked repository calls.
