---
source: src/modules/users/tests/integration/authenticatable.test.ts
sha256: ba0e31fa4a95239cdd3a34031b87b3cb77a3b45a390034f3f59f5a5adc9a0522
generated_at: 2026-11-08T08:53:44.715458+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/authenticatable.test.ts

## Purpose

Integration tests that verify the Mongo filter (`AUTHENTICATABLE_FILTER`) and the in-memory predicate (`isAuthenticatable`) produce the same answer for every combination of the `active` and `deletedAt` flags, using a real database. A second block exercises `linkOAuthAccount` on the user repository.

## Key elements

- **`STATES`** – A const array of four cases (enabled+live, banned, soft-deleted, banned+soft-deleted), each specifying the field overrides to apply and the expected `authenticatable` boolean.
- **First `describe` ("AUTHENTICATABLE_FILTER and isAuthenticatable")** – For each state, creates a user, then asserts both that `isAuthenticatable(user)` matches the expected value *and* that a Mongo `count` using `AUTHENTICATABLE_FILTER` yields 1 iff the account is authenticatable.
- **"treats an explicit null deletedAt like a missing one"** – Edge-case test: sets `deletedAt` to `null` via `updateMany` and confirms the filter still matches.
- **`googleEntry(providerId)`** – Small helper returning a provider-link object for Google with a given `providerId` and a fresh `connectedAt` timestamp.
- **Second `describe` ("linkOAuthAccount")** – Links two different `providerId`s under the same provider (`google`); asserts the first call returns `true`, the second returns `false`, and `oauthAccounts` holds exactly one entry.

## Relationships

- **`src/modules/users/authenticatable.ts`** – Source of `AUTHENTICATABLE_FILTER` and `isAuthenticatable`, the two implementations under test. The test's core contract is that they never disagree.
- **`src/modules/users/repository.ts`** – Provides `userRepository`, which exposes the Mongo-backed methods used here (`count`, `updateMany`, `findByIdWithCredentials`, `linkOAuthAccount`).
- **`src/modules/users/tests/factories.ts`** – Supplies `createUser` (persist a user with optional overrides) and the `userRepository` instance bound to the test DB.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` is called at module load to spin up a real (or in-memory) MongoDB instance for the test run.

## Notes

- The central invariant being guarded: the **query path** (Mongo filter) and the **predicate path** (in-memory check) must agree on every flag combination. A regression in either the filter or the predicate will surface here.
- `linkOAuthAccount` enforces **one entry per provider**, not per `providerId`. A second call with the same `provider` but a different `providerId` returns `false` and does not add a new entry.
- The `null` vs. *absent* `deletedAt` distinction is explicitly tested because the Mongo filter uses `$ne: null` (or equivalent) and a naive predicate might only check for key presence.
