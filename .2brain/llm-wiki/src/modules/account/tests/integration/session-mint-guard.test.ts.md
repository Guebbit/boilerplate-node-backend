---
source: src/modules/account/tests/integration/session-mint-guard.test.ts
source_sha256: caf987770ba6d1b5cafbac289c9ea3654cfd631d543c1ea21ab4db3a6280a98b
context_sha256: f24679d8d4ac9b04b62eb1f384ba3c661738fdf140b87f3afbe15dba0fa82b5e
generated_at: 2026-11-22T04:01:36.195639+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/integration/session-mint-guard.test.ts

## Purpose
Integration tests for the guard on the single code path that mints a first session. An account with a second factor armed must be refused unless the proof carries one, and a proof the account's session epoch has since passed must also be refused. The guard is a backstop for login paths that forget their own check, so the tests call the mint functions directly.

## Key elements
- `armedUser()`: creates a user with `twoFactorEnabledAt` set and a TOTP entry in `twoFactorMethods`.
- `sessionsOf(id)`: counts the refresh-session rows an account holds, via `sessionRowsOf`.
- `CASES`: a table of proof (`amr`) × armed/unarmed × mint kind (`start`/`continue`) → whether a session is minted:
  - Armed with `['pwd']`, `['google']` or `['pwd','email']` on `startSession` is refused.
  - Armed with `['pwd','otp']` on `startSession` is minted.
  - Unarmed with `['pwd']` on `startSession` is minted.
  - Armed with `['pwd']` on `continueSession` (a re-mint) is minted.
- `describe('the mint guard…')`: runs `CASES` with `it.each`. A refusal must be a `SecondFactorRequiredError`, any other error counts as `'other'` and fails. It also asserts that a refusal stores 0 session rows and a mint stores exactly 1.
- `describe('the proof time')`:
  - Bumps the account's session epoch to `provedAt + 1`, then expects `startSession` to reject with `StaleProofError` and store nothing.
  - Checks that `auth_time` in the minted JWT equals `Math.floor(provedAt / 1000)`, read back with unverified `decodeJwt`.

## Relationships
- `src/modules/account/session/jwt.ts`: provides `startSession` and `continueSession`, the functions under test. Both take `(userId, amr, …)`, and `startSession` also takes a `provedAt` argument as its fourth parameter.
- `src/modules/account/session/mint-guard.ts`: provides `SecondFactorRequiredError` and `StaleProofError`, the errors asserted on.
- `src/modules/account/tests/factories.ts`: provides `sessionRowsOf`.
- `src/modules/users/tests/factories.ts`: provides `createUser`.
- `src/modules/users/friends/account.ts`: provides `accountUserService`, whose `bumpSessionEpoch` is used to make a proof stale.
- `tests/support/setup-test-db.ts`: `setupTestDb()` is called at module top level to set up the test database.

## Notes
- The tests rely on `startSession` and `continueSession` being the guarded mint points. `continueSession` is expected to skip the second-factor requirement.
- Refusal tests assert that no session row is persisted, not only that an error was thrown.
