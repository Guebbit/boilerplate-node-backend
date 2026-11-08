---
source: src/modules/users/tests/integration/two-factor-writes.test.ts
sha256: bafc5c78bd8bdb17be36ddee6eeace1bfb9cf69414a0de2f311472611068fc71
generated_at: 2026-11-08T08:57:59.922991+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/two-factor-writes.test.ts

## Purpose

Integration tests for the two-factor write path (`persistTwoFactorMethods`, `spendBackupCode`, and the derived armed-flag logic). Every test models the "two requests in flight" scenario—two loaded copies of one account that write in turn—to verify per-method atomic updates, lost-update resistance, idempotent re-persist, and versioning invariants.

## Key elements

- **`ARMED`** – Module-level fixture: one TOTP record (with `lastUsedStep`) and one email record (with `codeHash`, `codeAttempts`, etc.), representing a realistic armed account.
- **`load(id)`** – Fetches a full `UserDocument` via `userService.findByIdWithCredentials`; throws if the fixture user is absent.
- **`field(id, method, key)`** – Reloads the document and reads a single field off one method entry.
- **`entryOf(user, method)`** – Extracts one `TwoFactorMethodRecord` from an in-memory copy; throws if the method is missing.
- **`withCodes()`** – Factory wrapper around `createUser` that seeds three backup-code digests plus a salt.
- **`codesOf(id)`** – Reads `twoFactorBackupCodes` from a freshly loaded document.
- **`flagOf(id)`** – Reads the derived `twoFactorEnabledAt` flag.
- **`MINTED`** – Fixture object (`{ salt, digests }`) simulating a freshly minted backup-code set.
- **`describe('persistTwoFactorMethods')`** – Ten tests covering: TOTP step race, multi-method concurrency, field clearing (unset vs. kept), adding a new method, dropping a named method, dropping all, co-writing account-level fields (`twoFactorBackupCodes`, `tokensValidAfter`), duplicate-method dedup, no-op persist (no version/`updatedAt` bump), version invariance on a real change, and settle-on-persist (second persist must not re-send stale values).
- **`describe('spendBackupCode')`** – Three tests for single-spend guarantee, stale-copy persistence not restoring spent codes, and settle-on-persist for the code list.
- **`describe('the armed flag and the first backup-code set')`** – Tests for the derived armed flag (file is truncated here).

## Relationships

- **`src/modules/users/services/index.ts`** – Source of `userService`; the tests exercise `persistTwoFactorMethods`, `claimTotpStep`, `spendBackupCode`, `findByIdWithCredentials`, and `markSessionsEnded`.
- **`src/modules/users/model.ts`** – Provides the `TwoFactorMethodRecord` and `UserDocument` types used throughout the file.
- **`src/modules/users/tests/factories.ts`** – Provides `createUser`, the test-seed factory for accounts.
- **`src/infrastructure/persistence/versioning.ts`** – Provides `versionOf`, used to assert that two-factor writes do **not** increment the account's optimistic-lock version.
- **`tests/support/setup-test-db.ts`** – Provides `setupTestDb`, called once at module top to initialise the in-memory / test database.

## Notes

- The central invariant under test: `persistTwoFactorMethods` writes **per-method, per-field** deltas in a single atomic update, never replacing the entire `twoFactorMethods` array. A stale copy must not clobber a concurrent write to a *different* method or field.
- Two-factor writes are explicitly **not** an "edit" of the account: `version` and `updatedAt` must remain unchanged after a successful persist.
- "Settle" semantics: once a copy has been persisted (or had a code spent), a subsequent persist of the same copy must not re-send already-applied values. Tests verify this by persisting a second request in between.
- The `ARMED` fixture always contains **both** a TOTP and an email method so that "different methods" scenarios have two realistic entries to work with.
- The file is truncated; the final `describe` block ("the armed flag and the first backup-code set") is incomplete in the source.
