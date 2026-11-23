---
source: src/modules/account/tests/integration/session-epoch.test.ts
source_sha256: 823c57c09e18fbf49fd15666c1d75f5dbd75df0369e7c7861686fa0558273294
context_sha256: c282fc48908e4754d68043cffa8e10f26043d8529d000be9ce2d2114faef51e2
generated_at: 2026-11-22T04:01:09.498259+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/integration/session-epoch.test.ts

## Purpose
Integration tests for the session epoch (`tokensValidAfter`). A token (access or refresh) minted before the epoch is refused, and each "I may be compromised" event moves the epoch. The tests run against the real clock because the token claim and the epoch are compared in whole seconds, so cases needing "before the bump" wait just over one second.

## Key elements
- `PAST_THE_SECOND_MS` (1100) and `nextSecond()`: sleep helper so the next token lands in a later whole second than the previous one.
- `loginAs(email)`: posts `/account/login` and returns `{ bearer, cookie }`, the access token as a `Bearer` header plus the `__Host-session` refresh cookie as a `Cookie` header.
- `statusWith(bearer)`: `GET /account` status, 200 while the token is live and 401 once it is not.
- `changedAccount()`: builds a user whose email changed to `new@example.com`, with `previousEmail` set to `old@example.com` and a live `email-change-undo` token (`undo-me`).
- `describe('a token minted before the epoch')`:
  - Covers refusal as an access token.
  - Covers refusal at `/refresh` even though the refresh token is still stored.
  - Checks that an older `bumpSessionEpoch` arriving late does not undo a later one.
- `describe('the events that move the epoch')` covers:
  - Password change: the caller's session is re-minted, other devices are killed, and the caller's old access token also dies.
  - Logout-all (`DELETE /account/sessions`): signs the caller out with no re-mint and clears the cookie. When revocation fails (mocked `findAuthenticatableById` rejection) it returns a 5xx, clears no cookie and ends nothing.
  - Plain logout: leaves other devices alone and does not set `tokensValidAfter`.
  - Confirming a TOTP 2FA factor: kills other sessions and deletes their refresh tokens, and the actor gets a re-minted refresh cookie.
  - Password reset confirm: purges pending one-time tokens and MFA challenges plus all sessions.
  - `/account/reauth`: retires the refresh token it was given.
- `describe('"this wasn\'t me" ...')`:
  - `/account/email-change/undo` ends sessions even when the old address was taken (409).
  - Emits an `account.sessions_revoked` outbox event with reason `email-change-undo`.
- `describe('a credential change moves the epoch in its own write')`: mocks `bumpSessionEpoch` to reject, so only a change that no longer depends on the bump can still end sessions. It starts with `email-change confirm`; the rest of the file is not shown.

## Relationships
- `@tests/http` (`api`), `@tests/setup-test-db` (`setupTestDb`), `@tests/environment` (`setEnvironment`), `@tests/totp` (`codeFor`) and `@tests/cookies` (`cookieHeader`): the shared test support used to drive the HTTP API, the database and the 2FA codes.
- `@modules/users/friends/account` (`accountUserService`): calls `bumpSessionEpoch` directly and spies on `bumpSessionEpoch` and `findAuthenticatableById`.
- `@modules/users/repository` (`userRepository`, imported via the users test factories): reads `tokensValidAfter` and sets `previousEmail`.
- `@modules/users/tests/factories`: `createUser`, `userRepository`, `PLAIN_PASSWORD`, `REPLACEMENT_PASSWORD`.
- `../factories` (account test factories): `plantToken`, `sessionRowsOf`, `tokenRowsOf`, for seeding and inspecting token and session rows.
- `@kernel/outbox`: `outboxEventModel` and `settleOutboxNudges` for asserting the revoke event.

## Notes
- `setEnvironment({ NODE_MAIL_TRANSPORT: 'outbox' })` runs before each test, so mail goes to the outbox.
- The suite uses the real clock, so it has several 1.1s sleeps and is slower than a unit test.
- `jest.restoreAllMocks()` runs in `afterEach` only inside the "own write" describe. The logout-all failure test uses `jest.spyOn` without a local restore in the visible portion.
