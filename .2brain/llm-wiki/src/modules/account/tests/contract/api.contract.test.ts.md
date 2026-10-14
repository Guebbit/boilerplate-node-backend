---
source: src/modules/account/tests/contract/api.contract.test.ts
sha256: 34e570ef61fbb9b18ed35a6284d02f45fbb8a5f468884b972b7abe6a07924e6b
generated_at: 2026-10-14T09:03:39.935780+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the self-service `/account` HTTP surface (profile update, password change, single-session logout, sessions listing, email verification, login with "remember me" tiers). They exist because these endpoints have state-dependent branches—duplicate email ownership, revoked cookies, spent tokens, foreign sessions—that a generated-payload sweep cannot exercise. Listing assertions check concrete IDs, not array lengths.

## Key elements

- **`jest.mock('@infrastructure/adapters/mailer')`** — Replaces `enqueueEmail` with a `jest.fn()` mock (not a spy) so tests can read the plaintext verify token out of the emailed link URL.
- **`verifyTokenFromMail()`** — Extracts the `#token=` fragment from the last queued email's `linkUrl`; the only way to recover the plaintext token because storage holds only a digest.
- **`mailTo(to)`** — Searches all queued mail calls for a given recipient (email-change flows queue two mails per request).
- **`readVerifyToken(userId)`** — Returns `true`/`false` for whether a verify-token row exists (presence check only, since the value is hashed at rest).
- **`cookieMaxAge(response, name)`** — Parses `Max-Age` seconds from a named `Set-Cookie` header.
- **`inJwtMode()`** — Pins `NODE_SESSION_MODE=jwt` for cases that assert on the access/refresh pair specifically.
- **`statusOfSession(cookie)`** — Probes liveness: `POST /account/refresh` in jwt mode, `GET /account` in cookie mode; returns the HTTP status.
- **`loginRemembering(remember?, email?)`** — Creates a user, logs in with an optional tier, and returns `{ user, bearer, jwtCookie, headers }` where headers are mode-aware.
- **`expectSessionCookies(response)`** — Asserts both `__Host-session` and `isAuth` cookies are set with no `Max-Age`/`Expires`.
- **`describe('POST /account/login — remember me')`** — Verifies tier-based cookie sizing, browser-session cookies when no tier is given, access-token window, and 422 for undeclared tiers.
- **`describe('the username ceiling')`** — Boundary tests: 51-char username → 422, 50-char → 201.
- **`describe('the "remember me" choice survives every re-mint')`** — Confirms the session tier flag persists across refresh rotations and signup.
- *(File is truncated; additional describe blocks for profile update, password change, logout, sessions listing, and email verification follow.)*

## Relationships

- **`src/modules/account/session/config.ts`** — Source of truth for `getSessionMode`, `getExpiryTime`, `getAccessExpiryTime`, and the `RefreshTokenExpiryTime` enum; tests assert cookie/`exp` values against these accessors rather than raw env vars.
- **`src/modules/account/tests/factories.ts`** — Provides `plantToken` and `tokenRowOf` for seeding/inspecting token rows directly in the test DB.
- **`src/modules/account/repository.ts`** — `sessionRepository` is imported to inspect or mutate session rows.
- **`src/modules/account/services/index.ts`** — Exports `EMAIL_VERIFY_TOKEN_TYPE` used to target the correct token row.
- **`src/modules/users/tests/factories.ts`** — `createUser`, `PLAIN_PASSWORD`, `REPLACEMENT_PASSWORD`, `WEAK_PASSWORD`, `userRepository` for account provisioning and password constants.
- **`src/modules/users/index.ts`** — `userService` for user-level operations in test setup.
- **`src/infrastructure/adapters/mailer.ts`** — Mocked wholesale; `enqueueEmail` is the sole observable for token extraction and mail routing assertions.
- **`src/infrastructure/adapters/logger.ts`** — Imported (likely for spy/log assertions in later, truncated sections).
- **`src/infrastructure/i18n/index.ts` / `context.ts`** — `translator` for asserting localized error messages.
- **`src/kernel/config.ts`** — `reauthWindowSeconds` for re-authentication timing assertions.
- **`tests/support/account-export.ts`** — `requestAndDownloadExport` for any export-related contract checks.
- **`src/modules/account/tests/contract/support.ts`** — `loginWithCookie` helper shared with sibling contract test files.

## Notes

- **Mailer is mocked, not spied.** `jest.spyOn` cannot redefine the non-configurable getter that a CommonJS namespace import exposes under SWC; a full `jest.mock` replacement is required.
- **Verify token is never readable from storage.** `verificationtokens.tokenHash` is a one-way digest; the plaintext exists only in the emailed link URL, so tests must go through the mailer mock.
- **Two mails per email-change.** `mailTo` uses `.find()` (search), not `.at(-1)`, because a `PATCH /account` email change queues a notice to the old address *and* a link to the new one.
- **Dual session-mode execution.** Every case runs under both `jwt` and `cookie` modes (`npm run test:contract:cookie` for the latter). Only cases that assert on the access/refresh token pair call `inJwtMode()`; all others are mode-agnostic.
- **Cookie expiry tolerance.** In `cookie` mode the Max-Age is "what is left of the row," so assertions use `toBeGreaterThan(expected − 5)` rather than strict equality.
- **Access token vs. refresh fallback.** The access token always gets the short `getAccessExpiryTime()` window, even when no remember-me tier is selected; tests guard against accidentally falling back to the refresh duration.
