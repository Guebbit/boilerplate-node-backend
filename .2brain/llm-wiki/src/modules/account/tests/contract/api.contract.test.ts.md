---
source: src/modules/account/tests/contract/api.contract.test.ts
sha256: d86d6e3758aadb21d46668902f7e6711480c7d532729a349bfba5fe2dde62372
generated_at: 2026-11-14T18:59:33.348449+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the self-service `/account` HTTP surface (login, signup, profile update, password change, session management, email verification). Unlike the unit suites' generated-payload sweep, these tests exercise state-dependent contract branches—a second account holding the same email, a revoked cookie, a spent token, someone else's session—that no random payload can set up. Listing assertions check specific IDs, never just lengths.

## Key elements

- **`setupTestDb()`** — provisions the test database before the suite runs.
- **`afterEach` hook** — settles background inline exports and sweeps the file sandbox after every case.
- **`jest.mock('@infrastructure/adapters/mailer', …)`** — replaces (not spies on) `enqueueEmail` with a resolved mock; the module is mocked at namespace level to work around a swc/CommonJS getter limitation.
- **`readVerifyToken(userId)`** — checks *presence* of a verify token row (the stored value is a one-way digest).
- **`verifyTokenFromMail()`** — extracts the plaintext token from the last queued mail's `linkUrl` `#token=` fragment (the only place the usable token exists).
- **`mailTo(to)`** — searches queued mails by recipient address (a `PATCH /account` email change queues two mails; reading only the last call would miss the notice to the old address).
- **`cookieMaxAge(response, name)`** — reads the `Max-Age` seconds value of a named `Set-Cookie` header.
- **`inJwtMode()`** — pins `NODE_SESSION_MODE=jwt` for cases that assert access/refresh token behavior specifically.
- **`statusOfSession(cookie)`** — probes whether a session cookie is still alive (uses `GET /account` in cookie mode, `POST /account/refresh` in jwt mode).
- **`loginRemembering(remember?, email?)`** — logs in with an optional tier, returns the user, bearer token, `__Host-session` cookie, and mode-appropriate auth headers.
- **`expectSessionCookies(response)`** — asserts both `__Host-session` and `isAuth` cookies are present with no `Max-Age` and no `Expires`.
- **Test suites** — `POST /account/login — remember me`, `the username ceiling`, `the "remember me" choice survives every re-mint`, and (truncated) additional suites covering password change, sessions listing, and email verification.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — fully mocked at namespace level; `enqueueEmail` is replaced with a jest mock whose call history the helpers above inspect.
- **`src/infrastructure/i18n/index.ts`** — `translator` imported for i18n-aware assertions.
- **`src/infrastructure/adapters/logger.ts`** — `logger` imported for structured logging in test setup or assertions.
- **`src/kernel/config.ts`** — `reauthWindowSeconds` imported for re-authentication timing assertions.
- **`src/modules/account/session/config.ts`** — `getSessionMode`, `getExpiryTime`, `getAccessExpiryTime` imported to assert cookie/token expiry values and to branch behavior by session mode.
- **`src/modules/account/repository.ts`** — `sessionRepository` imported for direct session-row manipulation.
- **`src/modules/account/services/index.ts`** — `EMAIL_VERIFY_TOKEN_TYPE` imported to scope token lookups.
- **`src/modules/account/services/export.ts`** — `settleInlineExports` called in the `afterEach` cleanup.
- **`src/modules/account/tests/contract/support.ts`** — `loginWithCookie` imported for cookie-mode login helpers.
- **`src/modules/account/tests/factories.ts`** — `plantToken`, `tokenRowOf` imported to insert/inspect verification-token rows.
- **`src/modules/users/tests/factories.ts`** — `createUser`, `PLAIN_PASSWORD`, `REPLACEMENT_PASSWORD`, `WEAK_PASSWORD`, `userRepository` imported for user provisioning and state assertions.
- **`src/modules/users/friends/account.ts`** — `accountUserService` imported for cross-module account operations.
- **`src/types/index.ts`** — `RememberTier` imported for tier-based expiry calculations.

## Notes

- The mailer is **replaced** via `jest.mock`, not spied on: `jest.spyOn` cannot redefine the non-configurable getter that a CommonJS namespace import exposes under the swc compiler.
- The verify token is a **digest at rest**; the plaintext form only exists in the emailed link URL. `verifyTokenFromMail` reads the mock directly (not via `observePort`) because `observePort` clears call history on hand-out, which would erase the very call being read.
- `mailTo` performs a **search** over all queued mails rather than reading the last call, because a single email-change request enqueues two mails (notice to old address + link to new address).
- In `cookie` session mode, `cookieMaxAge` reflects *remaining* lifetime of the row (a second may already have elapsed), so assertions use `> expected - 5` rather than strict equality. In `jwt` mode the tier value is exact.
- `inJwtMode()` is scoped to cases that test the access/refresh pair itself; all other cases run in whichever mode the suite is configured for (`npm run test:contract:cookie` runs them all in cookie mode).
