---
source: src/modules/account/tests/integration/link-crash-window.test.ts
source_sha256: 26321d02117dcd6aa5f186a6200411a5f3c7c67bf352a6895904e18c3a469c3f
context_sha256: 1968a25c5bb3ff50be1d45f3c7cd543b84b161e9516268f53d9f90e181f39424
generated_at: 2026-11-22T03:56:32.213803+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/integration/link-crash-window.test.ts

## Purpose
Integration test suite for the "crash window" of one-time links (email verification, email change confirm/undo, and others). It checks that spending the link token and the write it unlocks commit in one transaction. If the write fails, the token row is restored, the account is unchanged, and a retry with the same link succeeds. Each flow gets a case that fails that flow's own write once, after the spend has already run. That ordering is what shows the rollback came from the aborted transaction. The file's header doc points to a "spending a link" section of the account-sessions module documentation.

## Key elements
- `setupTestDb()` and a `beforeEach` that sets `NODE_MAIL_TRANSPORT: 'outbox'`. An `afterEach` calls `jest.restoreAllMocks()`.
- `connectionReset()`: builds an `ECONNRESET` error with no driver label, so nothing retries it. It simulates a dropped connection.
- `transientFailure()`: builds a `MongoServerError` labelled `TransientTransactionError`, which the driver may safely retry by re-running the whole transaction.
- Assertion helpers:
  - `holds(userId, type)`: whether the account still holds a token of that type.
  - `storedField(userId, key)`: one field of the stored account, including credentials.
  - `addressesOf(userId)`: the `email`, `previousEmail` and `pendingEmail` fields.
- Fixture builders:
  - `pendingChange()`: an account with `after@example.com` pending and an `email-change` token planted.
  - `changedAccount()`: an account moved off `old@example.com`, with a live `email-change-undo` token.
  - `lockedAccount(email)`: an account in its deletion grace period.
  - `armedAccount()`: an account with TOTP armed through the HTTP API. It returns the user and the backup codes.
- Test groups visible in the file:
  - **Email verification link**: a failed `save` leaves the `verify` token live and `verifiedAt` unset. The retry returns 204.
  - **Email change confirmation link**: a failed save keeps the old email and pending email. A transient error reruns the transaction and keeps `previousEmail` for undo, with exactly one `user.profile_changed` outbox event.
  - **A later write failing**: when `outboxEventModel.create` fails, the address is left unchanged and the token stays live.
  - **Email change undo link**: a failed save leaves the link live. A 409 when the old address is taken leaves the link live, ends every session (empty session rows, refresh returns 401), and succeeds once the address is freed.
  - **Undo racing a confirmation**: the test intercepts the token repository's `spend` to apply the thief's confirmation just before the spend. The prompt cuts off before the assertions, so the exact checks are not shown.

## Relationships
- `src/kernel/outbox.ts`: provides `outboxEventModel` (counted and mocked to fail) and `settleOutboxNudges`.
- `src/modules/account/repository.ts`: provides `verificationTokenRepository`, whose `spend` method is spied on to inject the race.
- `src/modules/account/services/oauth.ts` and `src/modules/account/services/two-factor-challenge.ts`: imported for `linkProviderToSignedInAccount`, `OAuthIdentityTakenError`, `startOAuthLink` and `buildLoginChallenge`. The visible portion does not use them yet, so they presumably serve later cases.
- `src/modules/users/tests/factories.ts`: `createUser`, `userRepository`, `PLAIN_PASSWORD` and `REPLACEMENT_PASSWORD`.
- `src/modules/users/repository.ts`: the `userRepository` used through those factories. Its `save` is mocked to fail writes, and `updateMany` and `findByIdWithCredentials` set up and inspect state.
- `src/modules/account/tests/factories.ts`: `plantToken`, `sessionRowsOf` and `tokenTypesOf`, for planting tokens and inspecting token and session rows.
- `tests/support/*` helpers:
  - `http.ts`: the `api()` HTTP client.
  - `setup-test-db.ts`: test database setup.
  - `environment.ts`: `setEnvironment`.
  - `totp.ts`: `codeFor`.
  - `cookies.ts`: `cookieHeader`.
  - `session-epoch.ts`: `forgetSessionEpoch`.
  - `callers.ts`: `testCallerContext`.

## Notes
- Failures are injected with `jest.spyOn(...).mockRejectedValueOnce`, so each fails exactly once and the retry goes through the real code.
- A non-transient `connectionReset()` is expected to surface as a 5xx. A `transientFailure()` is expected to be retried transparently, giving 204.
- The transient-retry test comments that the second attempt starts from a document the first attempt already edited. The test checks that `previousEmail` still ends up as the original address.
