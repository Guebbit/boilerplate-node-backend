---
source: src/modules/users/tests/integration/authenticatable.test.ts
sha256: ba0e31fa4a95239cdd3a34031b87b3cb77a3b45a390034f3f59f5a5adc9a0522
generated_at: 2026-10-15T12:13:03.667509+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/authenticatable.test.ts

## Purpose

Integration test that verifies two code paths never disagree about whether a user may authenticate: the Mongo query filter (`AUTHENTICATABLE_FILTER`) and the in-memory predicate (`isAuthenticatable`). It exercises all four flag combinations (active/banned × live/soft-deleted) against a real database, plus edge cases like an explicit `null` for `deletedAt` and the `linkOAuthAccount` write-once semantics.

## Key elements

- **`STATES`** — Table of the four flag combinations with expected `authenticatable` boolean; drives the `it.each` loop.
- **`describe('AUTHENTICATABLE_FILTER and isAuthenticatable')`** — For each state, creates a user via the factory, runs both the Mongo `count` (filter) and `isAuthenticatable` (predicate), and asserts they agree. Includes a separate case confirming `deletedAt: null` is treated as "not deleted."
- **`describe('linkOAuthAccount')`** — Verifies that calling `linkOAuthAccount` twice with different `providerId`s writes only the first entry and returns `[true, false]`.
- **`googleEntry(providerId)`** — File-local helper that builds a Google OAuth provider-link object.

## Relationships

- **`src/modules/users/authenticatable.ts`** — Source of `AUTHENTICATABLE_FILTER` (Mongo filter) and `isAuthenticatable` (predicate) under test.
- **`src/modules/users/tests/factories.ts`** — Provides `createUser` (inserts a user into the test DB) and `userRepository` (the repository instance used for queries, updates, and `linkOAuthAccount` calls).
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module load to spin up/tear down a real MongoDB for the suite.
- **`src/modules/users/repository.ts`** — The repository behind `userRepository`; `linkOAuthAccount`, `count`, `updateMany`, and `findByIdWithCredentials` all route through it.

## Notes

- This is an **integration** test (real Mongo via `setupTestDb`), not a unit test — do not mock the repository here.
- The core invariant being protected: the filter and the predicate must produce the same boolean for every account state. A regression in either path (e.g., adding a new flag to one but not the other) will be caught.
- `linkOAuthAccount` behavior (idempotent per provider, returns `true` only on first write) is tested in this file even though it isn't part of `authenticatable.ts` itself — it lives here because it exercises the same repository/user model.
- The `STATES` table uses `as const`, so adding a new state requires updating both the overrides object and the expected boolean.
