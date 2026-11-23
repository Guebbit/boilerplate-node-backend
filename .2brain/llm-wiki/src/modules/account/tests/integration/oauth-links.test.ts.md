---
source: src/modules/account/tests/integration/oauth-links.test.ts
source_sha256: 975ebe45ca2b220672b6bcf381963e4647ac9cf07bf780194b0fe30c08367063
context_sha256: 77b40964f1b2a78ac02798855ee621085226ea3cb4d1bc26f6a15dc0d42f97bc
generated_at: 2026-11-22T03:57:42.714029+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/integration/oauth-links.test.ts

## Purpose
Integration tests for the connected-accounts (OAuth links) feature of the account module. They cover listing the providers linked to the caller, disconnecting a provider (which requires a fresh session), and the content of the reset-confirm email, which names the providers still connected.

## Key elements
- `mockOutbox` / `jest.mock('@infrastructure/adapters/mailer')`: keeps the real mailer module but replaces `enqueueEmail` with a mock that pushes `{ template, data }` into `mockOutbox` instead of sending.
- `beforeEach` / `afterEach`: set `NODE_MAIL_TRANSPORT` to `outbox`, clear the outbox, and restore real timers after each test.
- `linkedAccount()`: creates a verified user, links `google` and `github` through `userRepository.linkOAuthAccount` (both with `connectedAt` `2026-01-01T00:00:00.000Z`), and logs in through `/account/login`. It returns `user`, a `bearer` header and the `__Host-session` cookie.
- `linksOf(userId)`: reads the stored provider names straight from the database via `findByIdWithCredentials`.
- `resetFor(token)`: posts to `/account/password/reset/confirm` with the replacement password.
- `GET /account/oauth/links` tests:
  - Returns providers with `connectedAt` and never leaks the provider subject id.
  - Returns an empty list for a password-only account.
  - Returns 401 without a session.
- `DELETE /account/oauth/links/{provider}` tests:
  - Disconnects one provider and leaves the other.
  - Returns 404 for a provider that is not connected.
  - Allows removing the last sign-in method.
  - Requires a fresh session: after the reauth window passes, a refreshed token gets 401 `REAUTH_REQUIRED`.
  - Cannot affect another account's links; the caller gets 404 and the owner's two links remain.
- Reset-confirm mail tests: the `account.reset-confirm` email's `providers` field contains `Google, Github` when both are linked. It matches `/No Google or GitHub sign-in/` when none are.

## Relationships
- `src/kernel/config.ts`: `reauthWindowSeconds('sensitive')` determines how far to advance the clock to make the session stale.
- `src/modules/users/tests/factories.ts`: supplies `createUser`, `userRepository`, `PLAIN_PASSWORD` and `REPLACEMENT_PASSWORD`.
- `src/modules/users/repository.ts`: `userRepository` is used for linking accounts and reading stored links. It is accessed through the users test factories.
- `src/modules/account/tests/factories.ts`: `plantToken` seeds a password reset token with a 1-hour TTL.
- `tests/support/http.ts`: `api()` is the HTTP client for the requests.
- `tests/support/setup-test-db.ts`: `setupTestDb()` prepares the test database.
- `tests/support/environment.ts`: `setEnvironment` sets the mail transport.
- `tests/support/clock.ts`: `freezeDate` and `advanceDate` control time for the fresh-session test.
- `tests/support/cookies.ts`: `cookieHeader` extracts the `__Host-session` cookie for `/account/refresh`.

## Notes
- The fresh-session test freezes the clock, advances it past the reauth window, then calls `/account/refresh` with the cookie. The refreshed token's `auth_time` is old, so the delete is rejected.
- Removing the last linked provider is deliberately allowed; the test name gives forgot-password recovery as the reason.
- The reset-confirm tests go through the real reset route, with only the mail enqueueing mocked.
