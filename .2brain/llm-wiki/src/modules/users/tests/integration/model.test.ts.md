---
source: src/modules/users/tests/integration/model.test.ts
sha256: 5c9129525089468ac245c2e517e38906f9997e78b035961f90e43eb6cdd33158
generated_at: 2026-10-29T06:21:22.107343+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/model.test.ts

## Purpose

Integration tests that verify two independent safeguards against credential leakage in user responses: Mongoose `select: false` (prevents loading) and `applyUserTransform` (strips at serialization). Also asserts email case-normalisation and the exact shape of the serialised User contract.

## Key elements

- **`expectNoCredentials(payload)`** — Serialises a value to JSON and asserts it contains neither the string `password` nor the bcrypt prefix `$2b$`. Used as a universal response-shape guard.
- **`withCredentials()`** — Thin wrapper over `createUser()` that documents the intent: "a user as the credential-exposure tests seed one."
- **`describe('email is case-insensitive')`** — Three tests: mixed-case input is stored lowercase, login lookup is case-insensitive, and the unique index rejects case-only duplicates.
- **`describe('user credential exposure')`** — Two nested blocks:
  - *`select: false (the safety net)`* — Confirms `findById`, `findOne`, `findAll` (lean) omit `password`, while `findByIdWithCredentials` still returns it.
  - *`applyUserTransform (the contract boundary)`* — Verifies `toJSON()` strips credentials, maps `_id` → `id`, drops `__v`, emits exactly the OpenAPI `User` key set (`active`, `createdAt`, `email`, `id`, `locale`, `updatedAt`, `username`, `verifiedAt`), keeps `active` independent of `deletedAt`, and works correctly on lean lists via `userService.search` and single lookups via `userService.getById`.

## Relationships

- **`src/modules/users/repository.ts`** — Imports `userRepository`; exercises `findById`, `findOne`, `findAll`, and `findByIdWithCredentials` to validate the `select: false` guard.
- **`src/modules/users/services/index.ts`** — Imports `userService`; calls `findForLogin` (case-insensitive lookup), `search` (lean list transformation), and `getById` (single-document normalisation).
- **`src/modules/users/tests/factories.ts`** — Imports `createUser` to seed documents with known credentials for every test case.
- **`tests/support/setup-test-db.ts`** — Imports and calls `setupTestDb()` at module scope, initialising the in-memory/fixture DB before any test runs.
- **`tests/support/stub.ts`** — Imports `asStub` for a type-safe cast of `items[0]` when asserting the `id` field on a lean result.

## Notes

- `setupTestDb()` runs at module import time (top-level call), not inside a `beforeAll`. It executes once when Jest loads the file.
- The two credential guards are tested **independently** because `.lean()` bypasses Mongoose's `toJSON` hook; `applyUserTransform` must therefore work on plain objects, not just hydrated documents.
- The exact key-set assertion (`Object.keys(...).toSorted()`) is the authoritative check that the serialised shape matches the OpenAPI `User` contract. Adding or removing a field without updating this list will break the test.
- `role` is explicitly **not** on this document; it lives in `@modules/access` and is passed as a parameter to `presentUser`. This test guards against accidental re-introduction of a `role` column.
- `active` and `deletedAt` are orthogonal booleans, not a single derived flag. The four-combination matrix test enforces that independence.
