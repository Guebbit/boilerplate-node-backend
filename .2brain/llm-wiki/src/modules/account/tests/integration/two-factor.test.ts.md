---
source: src/modules/account/tests/integration/two-factor.test.ts
source_sha256: 6c3a7aba8d6f6e13e769d8eea7d3bedce19e2f77ced5f01b2653ced3f6036c11
context_sha256: b9af1d72f4d7dc33b2b9ace7997712cff52481e5b14953aaa11f7be8eef9ee0d
generated_at: 2026-11-22T04:03:13.594116+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/integration/two-factor.test.ts

## Purpose
End-to-end integration suite for two-factor authentication. It drives the real Express app over HTTP to cover enrolling a device (TOTP) factor and a delivered (email) factor, the two-step login challenge, removing a factor, and disabling the rest. Its header calls out a bypass check, that a challenge token must not authenticate a request on its own, as the most important test.

## Key elements
- `mockOutbox` / `jest.mock('@infrastructure/adapters/mailer')`: replaces `enqueueEmail` so queued mails are captured in memory and nothing is sent. The real module is otherwise kept. It is named `mock*` because `jest.mock` is hoisted.
- `mailedCode()`: returns the digits from the latest `account.two-factor-code` mail. This is the only way to read a delivered code, since the account stores only its HMAC. It throws if no such mail was queued.
- `mailsOf(template)`: filters the outbox by template.
- `authenticateVerified()` / `authenticateUnverified()`: create a user through the factory, log in via `POST /account/login`, and return `{ user, bearer }`. The email factor requires a verified address, so the suite states verification explicitly instead of relying on the `authenticateAs` default.
- `enrollTotp(bearer)`: calls TOTP `setup` then `confirm` using `codeFor(secret, 0)`. It returns the secret and backup codes.
- `enrollEmail(bearer, proof?)`: calls email `setup` (with an optional proof code from an already-armed factor), then `confirm` with the mailed code. It returns the backup codes.
- `startLogin(email)`: does the password-only login step, which answers with a challenge rather than a token.
- `mintChallenge(userId)`: builds a DB-backed login challenge at service level via `userRepository.findByIdWithCredentials` and `buildLoginChallenge(user, ['pwd'])`, with no login round trip.
- Test groups visible: `status`, `status while an enrollment is pending`, `changing factors once one is armed`. More groups follow, including the bypass check named in the header.

## Relationships
- `tests/support/*` (`http`, `setup-test-db`, `environment`, `totp`, `cookies`, `session-epoch`, `callers`):
  - `api()` and `authenticateAs` drive the HTTP calls.
  - `setupTestDb()` handles database setup.
  - `setEnvironment` sets the mail transport.
  - `codeFor` generates TOTP codes.
  - `forgetSessionEpoch` is called after each enrollment.
  - `setCookie` and `testCallerContext` are imported for use in the rest of the file.
- `src/modules/users/tests/factories.ts`: supplies `createUser`, `userRepository`, `PLAIN_PASSWORD` and `REPLACEMENT_PASSWORD`.
- `src/modules/account/tests/factories.ts` (imported as `../factories`): supplies `plantToken`.
- `src/modules/account/services/two-factor-challenge.ts`: `buildLoginChallenge` is used by `mintChallenge`.
- `src/modules/account/services/index.ts`: `twoFactorService` is imported.
- `src/modules/account/two-factor/index.ts`: `DELIVERED_CODE_MAX_ATTEMPTS` is imported.
- `src/modules/account/session/config.ts`: `getExpiryTime` is imported.
- `src/types/index.ts`: `RememberTier` is imported.
- `jose`: `decodeJwt` is imported.
- `src/modules/users/repository.ts`: reached through the factories' `userRepository`.

## Notes
- The mail transport is set to `outbox` in `beforeEach`, because a mailed code is offered only where mail actually reaches a person (`mailDelivers`). The suite default `log` would drop it. The outbox is cleared in a separate `beforeEach`.
- A pending or replaced factor counts as disarmed in the status response. A replace disarms the factor before its new code is proved, so `enabled` becomes false and `methods` is empty.
- Once a factor is armed, adding a second method or replacing one without a code returns 422. The armed factor stays armed and no mail is queued. The first factor needs no code.
- A confirmed enrollment yields 10 backup codes (`backupCodesRemaining` is 10).
