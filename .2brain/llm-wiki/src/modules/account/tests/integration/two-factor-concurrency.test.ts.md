---
source: src/modules/account/tests/integration/two-factor-concurrency.test.ts
source_sha256: 03972dbe1e9b377065aaca023775ef366e25d05db830d1b5f1d317d0c576bae8
context_sha256: 261acbe6a7e4f559791332ff398321b98cba77a34c295f1798ec20b80014b1d9
generated_at: 2026-11-22T04:02:55.430603+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/integration/two-factor-concurrency.test.ts

## Purpose
Integration tests, run against the real app and test database, that fire parallel requests at the two-factor flows. They check that every single-use secret (backup code, mailed 2FA code, step-up code) is spent only once, and that every wrong guess is counted. Each assertion is meant to hold under any request interleaving, not only when one request happens to win.

## Key elements
- `mockOutbox` / `jest.mock('@infrastructure/adapters/mailer')`: replaces `enqueueEmail` so queued mails are captured. This is the only place a delivered code exists in the clear. The `mock*` prefix is required because `jest.mock` is hoisted.
- `beforeEach`: sets `NODE_MAIL_TRANSPORT` to `'outbox'` (a mailed code is offered only where mail reaches a person) and clears the outbox.
- `mailedCode(template)`: returns the digits of the newest queued mail of that template. It throws if none was queued.
- `signedIn()`: creates a verified user, logs in through the API, and returns the user and a `Bearer` header.
- `armedAccount()`: `signedIn()` plus TOTP setup and confirm. It returns the backup codes that confirm handed out, and calls `forgetSessionEpoch`.
- `challengeFor(userId)`: mints a fresh login challenge at the service level through `buildLoginChallenge`, one per racing request.
- `loginWith(userId, code)`: `POST /account/login/2fa` on its own fresh challenge.
- `storedCodes(userId)`: reads the stored backup-code digests fresh.
- `confirmEmail`, `oauthOnlySession`, `reauthWith`: helpers for the email-confirm route, a passwordless OAuth-style session (`startSession(..., ['google'])` plus `createAccessToken`), and `POST /account/reauth`.
- Test groups:
  - **Backup code in parallel.** The same code twice succeeds once and leaves 9 stored. Two different codes both succeed and leave 8. A login racing a regeneration leaves exactly the regenerated set.
  - **Mailed 2FA code.** The same code twice succeeds once. `DELIVERED_CODE_MAX_ATTEMPTS + 3` parallel wrong guesses burn the code, so the right code then gets 422.
  - **Step-up (reauth) code.** The same code twice succeeds once. Wrong guesses are counted, with the same ceiling check. Sending or spending a code does not change the account's `versionOf`.
  - **First backup-code set.** Confirming TOTP and email in parallel stores one set, and every code handed out hashes to a stored digest.

## Relationships
- Uses `tests/support/*` helpers: `api` (`http`), `setupTestDb`, `setEnvironment`, `codeFor` (`totp`), `forgetSessionEpoch` (`session-epoch`), and `testCallerContext` (`callers`).
- Uses `createUser`, `PLAIN_PASSWORD` and `userRepository` from the users test factories. `userRepository` is also used directly to read stored state and to create the OAuth-only user.
- Calls `twoFactorService` from `account/services` directly, and `buildLoginChallenge` from `services/two-factor-challenge`.
- Imports `DELIVERED_CODE_MAX_ATTEMPTS` and `hashBackupCode` from `account/two-factor`, to size the guess flood and compare stored digests.
- Uses `startSession` and `createAccessToken` from `session/jwt` to build the OAuth-only session.
- Uses `versionOf` from `infrastructure/persistence/versioning` for the version-stability assertion.

## Notes
- The mocked mailer spreads `jest.requireActual`, so only `enqueueEmail` is replaced.
- Several tests call `forgetSessionEpoch(bearer)` after arming a factor. The file does not say why.
- The wrong-guess tests only assert that the correct code is rejected with 422 after the ceiling is exceeded.
