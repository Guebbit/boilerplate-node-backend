---
source: src/modules/users/tests/integration/model.test.ts
sha256: 04ea7376fccdc13aff8235032be51511e24518c881043e3903519bb2266bdb37
generated_at: 2026-09-23T19:35:16.097818+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/model.test.ts

## Purpose

Integration test that verifies credentials (bcrypt hash, live tokens) can never leak into a serialized user response. It asserts two independent guards: the Mongoose `select: false` option prevents loading, and the `applyUserTransform` allowlist (exposed via `toJSON`) strips them at serialization time—including for `.lean()` documents that bypass `toJSON` hooks.

## Key elements

- **`expectNoCredentials(payload)`** — helper that JSON-stringifies a payload and asserts it contains no `password`, `tokens`, or `$2b$` substrings. The single assertion reused across every test case.
- **`withTokens()`** — seeds a user (via `createUser` factory) with one live `REFRESH` token so tests have a realistic credentials-bearing document.
- **`describe('select: false (the safety net)')`** — four tests confirming `findById`, `findOne`, `findAll` (lean) omit `password`/`tokens`, while `findByIdWithCredentials` deliberately returns them.
- **`describe('applyUserTransform (the contract boundary)')`** — tests that `toJSON()` output:
    - strips credentials even from a fully-loaded document,
    - replaces `_id`/`__v` with a single `id` string,
    - emits exactly the OpenAPI `User` property set (asserted via a sorted key list),
    - keeps `active` independent of `deletedAt` (four quadrants),
    - defaults `active` to `true` when unset,
    - exposes `deletedAt` on soft-deleted accounts without loosening credential guards,
    - normalizes lean lists through `userService.search` and single lookups through `userService.getById`.

## Relationships

- **`src/modules/users/model.ts`** — source of the `TokenType` enum imported here, and the schema whose `select: false` fields and `toJSON` transform (i.e. `applyUserTransform`) are the behavior under test.
- **`src/modules/users/repository.ts`** — `userRepository` is exercised directly for `findById`, `findOne`, `findAll`, and `findByIdWithCredentials`.
- **`src/modules/users/service.ts`** — `userService.search` and `userService.getById` are the service-level paths that must also emit clean payloads.
- **`src/modules/users/tests/factories.ts`** — `createUser` seeds fixtures (optionally with tokens, `active`, `deletedAt`, etc.) before each assertion.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module load to provision/tear down a temporary database for the integration run.
- **`tests/support/stub.ts`** — `asStub` is used to type-assert the `items[0]` element of `userService.search` without importing a concrete response interface.

## Notes

- The `expectNoCredentials` helper checks for the literal substrings `'password'`, `'tokens'`, and `'$2b$'` in the serialized output. Any field name containing those words will trip it—keep payload field names disjoint from those strings, or the test will false-positive.
- `findAll` is tested via the lean (plain-object) path; the lean branch bypasses Mongoose's `toJSON` virtual, so the `select: false` guard is the only protection there. The `toJSON`-based tests use `findByIdWithCredentials` to confirm the allowlist is a second, independent layer.
- The exact-key assertion (`toSorted()` comparison) is intentionally brittle: adding or removing a field from the `User` contract requires updating this list. That is the point—it acts as a contract diff.
- `active` and `deletedAt` are tested as orthogonal flags, not as a derived boolean. Do not introduce a computed `active` that folds in `deletedAt` without revisiting these four-quadrant cases.
