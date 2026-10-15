---
source: src/modules/account/tests/contract/api.contract.test.ts
sha256: 78d5f124d7d8e5755bdcf321272e51df352a5cba7adffbcc0a13ea6498e12e8b
generated_at: 2026-10-15T10:09:20.497766+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the self-service `/account` HTTP surface: login (remember-me tiers), signup, username ceiling, password change, session rotation, single-session logout, sessions listing, and email verification. They cover scenario branches that depend on multi-actor or stateful preconditions (a second account holding the same email, a revoked cookie, a spent token, someone else's session) — situations a generated-payload unit sweep cannot set up. Listing assertions check actual IDs, never just array lengths.

## Key elements

- **`setupTestDb()`** – one-time DB reset before the suite.
- **`jest.mock('@infrastructure/adapters/mailer')`** – replaces `enqueueEmail` with a resolving mock so tests can read queued mail content.
- **`readVerifyToken(userId)`** – checks whether a verify-token row exists for a user (only presence is checkable; the stored value is a `hashToken` digest).
- **`verifyTokenFromMail()`** – extracts the plaintext `#token=` fragment from the most recently queued mail's `linkUrl`. The only way to recover the usable token because storage holds only a digest.
- **`mailTo(to)`** – searches all queued mail calls for the envelope addressed to `to` (not just the last one, since an email-change queues two mails).
- **`cookieMaxAge(response, name)`** – parses the `Max-Age` directive off a named `Set-Cookie` header.
- **`inJwtMode()`** – pins `NODE_SESSION_MODE=jwt` for tests that exercise the access/refresh token pair specifically.
- **`statusOfSession(cookie)`** – probes whether a session cookie is still alive (200 vs 401) using the mode-appropriate endpoint.
- **`loginRemembering(remember?, email?)`** – performs a full login, returns `{ user, bearer, jwtCookie, headers }` shaped for the active session mode.
- **`expectSessionCookies(response)`** – asserts both `__Host-session` and `isAuth` cookies are present with no `Max-Age` or `Expires` (browser-session semantics).
- **Test suites** – `POST /account/login — remember me`, `the username ceiling`, `the "remember me" choice survives every re-mint`, and further suites (truncated in source) covering profile update, password change, logout, sessions, and email verification.

## Relationships

- **`@infrastructure/adapters/mailer`** – mocked at module level; `enqueueEmail` calls are the sole observable channel for verification-token delivery.
- **`@infrastructure/adapters/logger`** – imported as `logger` (used for test logging/diagnostic output).
- **`@infrastructure/i18n`** – `translator` imported for assertion helpers around localized response strings.
- **`@kernel/config`** – `reauthWindowSeconds` read to build timing expectations around re-authentication.
- **`@modules/account/session/config`** – `getSessionMode`, `getExpiryTime`, `getAccessExpiryTime`, `RefreshTokenExpiryTime` drive tier assertions and mode-branching logic.
- **`@modules/account/repository`** – `sessionRepository` imported for direct DB assertions on session rows.
- **`@modules/account/services`** – `EMAIL_VERIFY_TOKEN_TYPE` constant used to query the correct token row.
- **`./support`** (`tests/contract/support.ts`) – `loginWithCookie` helper for cookie-mode authentication in specific cases.
- **`../factories`** (`tests/factories.ts`) – `plantToken`, `tokenRowOf` for seeding and reading token rows.
- **`@modules/users/tests/factories`** – `createUser`, `PLAIN_PASSWORD`, `REPLACEMENT_PASSWORD`, `WEAK_PASSWORD`, `userRepository` for account and user fixtures.
- **`@modules/users`** – `userService` imported for service-level assertions.
- **`@tests/account-export`** – `requestAndDownloadExport` for the account-data-export endpoint test.

## Notes

- **Mailer is `jest.mock`'d, not spied.** `jest.spyOn` cannot redefine the non-configurable getter a CommonJS namespace import exposes under the `swc` transform, so a full module mock is required.
- **Verify token is unrecoverable from storage.** `verificationtokens.tokenHash` stores a one-way digest; the only plaintext copy lives in the emailed link's `#token=` fragment. Tests must read it from the mock mailer.
- **`mailTo` is a search, not `at(-1)`.** An email-change request queues two mails (notice to old address + link to new address); reading only the last call would miss the notice.
- **`verifyTokenFromMail` bypasses `observePort`.** That helper clears the mock's call history on hand-out, which would erase the very call being read.
- **Cookie-mode `Max-Age` is approximate.** In `cookie` mode the value is "what is left of the row," so a second may already have elapsed; assertions use `toBeGreaterThan(expected - 5)` rather than strict equality.
- **`inJwtMode()` is per-test, not per-suite.** Only tests that need the access/refresh pair pin the mode; all other cases run in whatever mode the surrounding suite uses (`npm run test:contract:cookie` runs them in cookie mode).
