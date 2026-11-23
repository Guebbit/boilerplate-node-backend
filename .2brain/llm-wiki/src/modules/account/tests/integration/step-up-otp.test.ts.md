---
source: src/modules/account/tests/integration/step-up-otp.test.ts
source_sha256: c05e22857835069ff9d0899b58d0809db109428e0017304dde8e3927715e45e9
context_sha256: 03cbe51e92ca00b1a8e54c468b84d403ad18877794cd6e97a26962f288d068a1
generated_at: 2026-11-22T04:02:37.479689+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/integration/step-up-otp.test.ts

## Purpose
Integration tests for step-up authentication on accounts with a second factor (TOTP). They check that the identity routes (email change, password change, account deletion) require an `otp` proof in the session. They also check that `POST /account/reauth` grants only what it proved, and that an email change can be undone from a link mailed to the old address. Accounts without 2FA are expected to see no new requirement.

## Key elements
- `mockOutbox` and the `jest.mock` of `@infrastructure/adapters/mailer`: `enqueueEmail` is replaced so each queued mail (`to`, `template`, `data`) is pushed to an in-memory array. The rest of the mailer module is kept real. The outbox is cleared in `beforeEach`.
- `sessionWith(userId, amr)`: mints a refresh token with `continueSession` and an access token with `createAccessToken`. It returns a `Bearer` header value and a `__Host-session` cookie. It stands in for a session that existed before the factor was armed.
- `tokenOfLastMail(template)`: extracts the `token=` query value from the latest mail of that template's `linkUrl`. It throws if no such mail exists.
- `armedAccount(email?)`: creates a verified user, logs in, runs TOTP setup and confirm via `/account/2fa/methods/totp/*`, and calls `forgetSessionEpoch`. It returns the user and the backup codes.
- `statusOf`, `emailOf`, `undo`, `requestChange`: small helpers for awaiting a status, reading the stored email, spending an undo token and requesting an email change.
- `requested()`: creates a user with email `old@example.com`, requests a change, and returns the undo token (template `account.email-change-notice`) and the confirm token (template `account.verify-request`).
- Test groups:
  - **Identity routes with 2FA**: a `pwd`-only session gets 401 `REAUTH_REQUIRED` with `details.methods: ['otp']`. A session with `['pwd','otp']` passes. Password change and deletion are gated the same way. An account without 2FA is unaffected.
  - **`POST /account/reauth` with an otp**: a password-only reauth drops `otp` from the session. A valid code (a backup code) earns `otp`. A wrong code returns 422 and a locked account returns 429. A wrong password does not spend an MFA attempt (`mfaFailures` stays 0). An otp sent for an account with no 2FA returns 422.
  - **Undoing an email change**: undo after confirm returns 204, restores `old@example.com`, clears `previousEmail` and sets `tokensValidAfter`. Undo of a pending change cancels it and invalidates its confirmation link. The visible part of the file ends partway through this group.

## Relationships
- `src/modules/account/session/jwt.ts`: supplies `createAccessToken` and `continueSession` for minting sessions with chosen `amr` claims.
- `src/modules/account/tests/factories.ts`: supplies `plantToken` and `removeTokensOfKind`, which are imported (not used in the visible portion).
- `src/modules/users/tests/factories.ts`: supplies `createUser`, `userRepository`, `PLAIN_PASSWORD` and `REPLACEMENT_PASSWORD`.
- `src/modules/users/repository.ts`: reached through `userRepository` (`findByIdWithCredentials`, `updateMany`) to read stored state and to set MFA lockout fields.
- `tests/support/http.ts` (`api`), `setup-test-db.ts` (`setupTestDb`), `environment.ts` (`setEnvironment`, which sets `NODE_MAIL_TRANSPORT: 'outbox'`), `totp.ts` (`codeFor`) and `session-epoch.ts` (`forgetSessionEpoch`) provide the test harness.

## Notes
- `sessionWith` is a re-mint, not a first-session mint. The comment says a first-session mint would refuse to create these sessions.
- `armedAccount` calls `forgetSessionEpoch` after confirming TOTP, so the setup bearer token is not left as a live session.
- Test titles are phrased as continuations of their `describe` text (e.g. "challenge a session that proved only a password").
