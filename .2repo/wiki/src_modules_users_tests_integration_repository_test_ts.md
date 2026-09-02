# src/modules/users/tests/integration/repository.test.ts

## Purpose

Integration test suite for `userRepository`, run against an in-memory MongoDB (wired up by `setupTestDb`). It verifies the full CRUD surface of the repository factory (`create`, `findById`, `findOne`, `findAll`, `count`, `save`, `deleteOne`, `updateMany`) plus the token-lifecycle methods the users module adds (`tokenRemoveAll`, `tokenRemoveExpired`, and related). The file exists so that repository behavior is validated end-to-end (including Mongoose hooks and lean-query semantics) rather than in isolation.

## Key elements

- **`setupTestDb()`** (top-level call) – initialises the in-memory Mongo instance before any test runs.
- **`describe('userRepository')`** – the root suite; each nested `describe` block maps to one repository method.
- **Token-method tests** – seed `tokens` arrays directly with `hashToken(…)` values and `TokenType` enum members, then exercise `tokenRemoveAll`, `tokenRemoveExpired` (including the `supersededAt` grace-window logic), and verify results via `findByIdWithCredentials`.
- **`asStub<T>(user).save`** – uses the `asStub` helper to safely check that `findAll` returns lean (non-Mongoose) objects without the `save` method.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/users/index.ts` (barrel) | Source of `userRepository`, `hashToken`, `TokenType`, `UserDocument`. |
| `src/modules/users/model.ts` | Imported directly as `userModel as Users`; bypasses the barrel because no sibling module consumes it and `eslint-plugin-boundaries` permits a spec to reach its own module's internals. |
| `src/modules/users/repository.ts` | System under test; exercised exclusively through the `userRepository` export from the barrel. |
| `src/modules/users/tests/fixtures.ts` | Provides `makeUser` (plain-data factory) and `createUser` (persists via the repository) used to seed state. |
| `tests/support/setup-test-db.ts` | Provides `setupTestDb`, which boots the in-memory Mongo and connects Mongoose. |
| `tests/support/stub.ts` | Provides `asStub`, a typed cast helper used to assert absence of Mongoose methods on lean results. |

## Notes

- **Token seeding convention:** every token fixture calls `hashToken(…)` explicitly rather than going through `tokenAdd`. This mirrors what production actually writes to the database; a plaintext seed would describe a document the app never persists.
- **`tokenRemoveExpired` return value:** the method returns a plain count (`number`), not a status code or error. The test asserts `toBe(1)` rather than checking for a thrown error.
- **`supersededAt` grace window:** `tokenRemoveExpired` sweeps both expired tokens *and* superseded (rotated-away) tokens whose grace window has elapsed. Tokens superseded "just now" (within the grace window) are intentionally kept. This is the most subtle behavioural contract in the file.
- **Direct model import:** the file deliberately imports `userModel` from `@modules/users/model` instead of the barrel. The inline comment documents the rationale and the lint rule that makes this legal; do not "fix" it to go through the barrel.
- **`findAll` lean semantics:** tests explicitly assert that returned objects have no `.save` method. Any regression to hydrated Mongoose documents would be caught here.
