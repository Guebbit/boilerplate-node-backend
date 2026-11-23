---
source: src/modules/account/tests/integration/login-restore.test.ts
source_sha256: 558b2a9920b5b30fcdd750da509df5dd20548549ea50d62d2d58bdcc898b1975
context_sha256: c86d9276cb479739b87e81c12038f31798a27036ae5aa302344a4ab7d9464aeb
generated_at: 2026-11-22T03:56:57.093707+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/integration/login-restore.test.ts

## Purpose
HTTP-level integration tests for signing in to an account that is in its deletion grace period. A correct password check returns a "claim check" (challenge) instead of a session, and `POST /account/login/restore` then cancels the deletion and starts the session. The file covers the password, TOTP and OAuth login paths.

## Key elements
- `setupTestDb()` / `beforeAll` hook: sets up the test database and registers the `fake` OAuth provider (`fakeOAuthProvider`) through `registerOAuthProvider`.
- `daysFromNow(days)`: returns a date offset from now (negative means in the past).
- `pendingAccount(overrides)`: creates a verified user, then calls `accountUserService.scheduleOwnDeletion` with an epoch one minute ago and a purge date 20 days out.
- `signIn(email, password)`: posts to `/account/login`.
- `armTotp(email)`: signs in, enrolls and confirms TOTP over `/account/2fa/methods/totp/*`, and returns the secret. It must run before the account is scheduled for deletion.
- `claimCheck(email)`: creates a pending account, signs in, and returns the `challenge`.
- Test groups:
  - **`POST /account/login` in grace**:
    - Returns 200 with `{deletionPending, challenge, expiresAt, purgeAt}`, no `Set-Cookie`, no session rows, and `deletedBy` still `'owner'`.
    - A wrong password gives the same response as an unknown user (compared with `withoutInstance`).
    - A banned account, or one past `purgeAt`, gets a plain 401.
  - **`POST /account/login/restore`**:
    - Restores the account, and the returned token can call `GET /account`.
    - A claim check cannot be used twice.
    - Unknown, expired (planted via `plantToken` with `DELETION_RESTORE_TOKEN_TYPE`) and missing challenges all return 401.
    - If `purgeAt` passes after sign-in, the restore returns 401 and the account stays locked.
  - **Second factor**: with MFA armed, `/account/login` returns `mfaRequired`. `/account/login/2fa` then returns `deletionPending`, with no `__Host-session` cookie. The restore then succeeds.
  - **OAuth callback**:
    - The callback redirects with `deletionPending`, `purgeAt` and `expiresAt` query params.
    - It sets a `__Host-oauth_deletion_challenge` cookie and no session cookie.
    - The restore call works from that cookie alone, with an empty body.

## Relationships
- `tests/support/http.ts` (`api`), `tests/support/setup-test-db.ts`, `tests/support/totp.ts` (`codeFor`), `tests/support/cookies.ts` (`cookieHeader`, `setCookie`) and `tests/support/problem.ts` (`withoutInstance`) supply the request, DB, TOTP, cookie and problem-body helpers.
- `src/modules/users/tests/factories.ts` supplies `createUser`, `PLAIN_PASSWORD` and `userRepository`, used to seed users and to assert persisted state (`deletedAt`, `purgeAt`, `deletedBy`).
- `src/modules/users/friends/account.ts` supplies `accountUserService`, whose `scheduleOwnDeletion` puts accounts into the grace state.
- `src/modules/users/repository.ts` is the repository behind `userRepository`, which is also used to link the fake OAuth identity to the user.
- `src/modules/account/tests/factories.ts` supplies `plantToken` and `sessionRowsOf`.
- `src/modules/account/token-types.ts` supplies `DELETION_RESTORE_TOKEN_TYPE`.
- `src/modules/account/oauth/providers/index.ts` supplies `registerOAuthProvider`, and `scenarios/support/doubles/oauth-fake.ts` supplies `fakeOAuthProvider`. Together they run the OAuth flow without a real provider.

## Notes
- The deletion epoch is set one minute in the past so it is safely before any new login.
- The TOTP code is generated with an offset (`codeFor(secret, 0)` for the setup confirm, `codeFor(secret, 1)` for the login), presumably so the two codes differ.
- Expiry and purge-date cases are simulated by editing rows (`updateMany` on `purgeAt`) or planting tokens with a negative `ttlMs`, not by waiting.
