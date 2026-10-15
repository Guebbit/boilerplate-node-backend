---
source: src/modules/users/tests/integration/two-factor-writes.test.ts
sha256: bafc5c78bd8bdb17be36ddee6eeace1bfb9cf69414a0de2f311472611068fc71
generated_at: 2026-10-15T12:16:07.858072+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/two-factor-writes.test.ts

## Purpose

Integration tests for the two-factor write path on the user service. The file verifies that `persistTwoFactorMethods`, `spendBackupCode`, and the derived "armed" flag behave correctly under concurrent-write conditions — i.e., when two loaded copies of the same account write in turn, each write touches only the methods/fields it changed, never clobbering a value another request already settled.

## Key elements

- **`ARMED`** – Constant array of two `TwoFactorMethodRecord` entries (TOTP + email) used as the default fixture shape for every test.
- **`load(id)`** – Calls `userService.findByIdWithCredentials` and throws if the fixture user is missing; returns a full `UserDocument`.
- **`field(id, method, key)`** – Reads a single key of a single method entry by reloading the document fresh.
- **`entryOf(user, method)`** – Synchronous helper that extracts one `TwoFactorMethodRecord` from an in-memory copy; throws if the method is absent.
- **`withCodes()`** – Creates a user pre-seeded with three backup-code digests and a salt.
- **`codesOf(id)`** – Reads the stored `twoFactorBackupCodes` array fresh from the DB.
- **`flagOf(id)`** – Reads the derived `twoFactorEnabledAt` field fresh.
- **`MINTED`** – A constant `{ salt, digests }` pair representing a freshly generated backup-code set.
- **`describe('persistTwoFactorMethods', …)`** – Eleven tests covering: TOTP step race, cross-method concurrent writes, field clearing, method addition, selective removal (`['totp']`), full removal (`'all'`), account-level fields in the same write, duplicate-method dedup, no-op write (version/updatedAt unchanged), real-change version/updatedAt invariance, and "settled copy" semantics.
- **`describe('spendBackupCode', …)`** – Three tests covering: single-spend guarantee, stale-copy persistence not resurrecting a spent code, and settling preventing re-send.
- **`describe('the armed flag and the first backup-code set', …)`** – (Truncated in source) Tests that the armed flag is derived from stored entries and that the first backup-code set is written atomically.

## Relationships

- **`src/modules/users/services/index.ts`** – The test's primary subject. Exercises `persistTwoFactorMethods`, `spendBackupCode`, `claimTotpStep`, `findByIdWithCredentials`, and `markSessionsEnded` on `userService`.
- **`src/modules/users/model.ts`** – Provides the `TwoFactorMethodRecord` and `UserDocument` types used throughout the file's helpers and assertions.
- **`src/modules/users/tests/factories.ts`** – Supplies the `createUser` factory to seed accounts with specific two-factor state.
- **`src/infrastructure/persistence/versioning.ts`** – Exports `versionOf`, used to assert that two-factor writes do or do not bump the document version.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` initialises the in-memory database before any test runs.

## Notes

- The central invariant under test: `persistTwoFactorMethods` writes **per-method, per-field** diffs and never re-sends the full array as loaded. Tests construct two loaded copies and interleave their writes to prove no lost-update.
- "Settling" is a first-class concern: after a successful persist the in-memory copy is considered settled, so a *second* persist on the same object must be a no-op (see the `codeAttempts` 3-vs-4 test and the backup-code list tests).
- Two-factor writes are deliberately **not** treated as account edits: `versionOf` and `updatedAt` are expected to remain unchanged even when data actually changes.
- The file is an integration test (real DB via `setupTestDb`), not a unit test — assertions read values back from the database rather than mocking service internals.
