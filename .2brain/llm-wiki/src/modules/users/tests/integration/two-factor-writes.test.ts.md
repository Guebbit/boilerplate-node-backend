---
source: src/modules/users/tests/integration/two-factor-writes.test.ts
sha256: bcd2e94e89edd13cb20e91f29688f14cabf3b421045c21145d30829b4867af51
generated_at: 2026-11-14T22:39:41.829938+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/two-factor-writes.test.ts

## Purpose

Integration tests for the write-side of two-factor authentication on a user account. The central concern is that `persistTwoFactorMethods` patches only the per-method fields the caller actually changed, in one atomic update, so that concurrent in-flight requests don't overwrite each other's changes (lost-update protection). Secondary suites cover `spendBackupCode` atomicity and the derivation of the armed flag / first backup-code set.

## Key elements

- **`ARMED`** — Module-level fixture: one TOTP entry (step 10) and one email entry (code sent, 1 attempt). Used as the starting state for most tests.
- **`load(id)`** — Loads a full `UserDocument` via `accountUserService.findByIdWithCredentials`; throws if the fixture user is missing.
- **`field(id, method, key)`** — Re-reads the DB and returns one field of one method entry, used to assert the *stored* state after a write.
- **`entryOf(user, method)`** — Extracts a `TwoFactorMethodRecord` from an in-memory copy; throws if absent.
- **`describe('persistTwoFactorMethods')`** — 11 tests covering: TOTP step race, different-method concurrent writes, selective field clearing, method addition, targeted method removal (`['totp']`), full removal (`'all'`), account-level fields in the same update, duplicate-enrollment dedup, no-op persist (version unchanged), version/updatedAt invariance, and copy-settling (second persist is a no-op).
- **`withCodes()`** — Factory: account seeded with three backup-code digests and a salt.
- **`codesOf(id)`** — Reads the stored `twoFactorBackupCodes` array fresh.
- **`describe('spendBackupCode')`** — 3 tests: single-spend atomicity, stale-copy persist can't resurrect a spent code, copy-settling prevents re-send of the code list.
- **`MINTED`** — Fixture representing a freshly minted backup-code set (`{ salt, digests }`).
- **`describe('the armed flag and the first backup-code set')`** — Tests that the `twoFactorEnabledAt` flag is derived from stored entries and that the first code set is written alongside (file truncated in source).

## Relationships

- **`src/modules/users/friends/account.ts`** — Primary SUT source. Imports `accountUserService` and calls `persistTwoFactorMethods`, `claimTotpStep`, `spendBackupCode`, `findByIdWithCredentials`, `markSessionsEnded`.
- **`src/modules/users/model.ts`** — Type imports: `TwoFactorMethodRecord`, `UserDocument`.
- **`src/modules/users/tests/factories.ts`** — `createUser` is used to seed fixture accounts with specific `twoFactorMethods` / `twoFactorBackupCodes` state.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module top level to provision an isolated test database.
- **`src/infrastructure/persistence/versioning.ts`** — `versionOf` is used in assertions to confirm that 2FA writes do *not* bump the account's optimistic-lock version.

## Notes

- `persistTwoFactorMethods` deliberately does **not** increment the account version or `updatedAt`; tests assert this explicitly. It is a sub-document patch, not an account edit.
- An optional second argument to `persistTwoFactorMethods` (an array of method names, or the string `'all'`) signals which methods to *remove*; omitting it means "keep all existing, patch what changed."
- "Settling" is a key invariant: after a successful persist the in-memory copy is marked so that a subsequent call with the same object is a no-op. Tests verify this by persisting the stale copy *after* a newer write and checking the newer value survives.
- The two-copies-in-flight pattern (`const first = await load(id); const second = await load(id);`) simulates concurrent HTTP requests without real concurrency; writes are sequenced to reproduce race conditions deterministically.
- The file is truncated in the repository snapshot; the last `describe` block (`the armed flag and the first backup-code set`) is incomplete.
