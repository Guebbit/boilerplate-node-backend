---
source: src/modules/account/tests/contract/oauth.contract.test.ts
source_sha256: f52ca78b3e03838de97ff63bb27f3e02d09d1230ec2aad9e45dd0f2b5f867d8b
context_sha256: 60b0c68b0fabb56ef013309c70b2170d1eef03fbb344a17259c861c0e8604f56
generated_at: 2026-11-22T03:50:52.959164+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/contract/oauth.contract.test.ts

## Purpose
Contract tests for the OAuth HTTP surface. They run the full start → callback round trip through a `fake` provider against the real routes, the real CSRF/PKCE cookies, and a real database. This is the same path a Cypress spec walks in a browser. Provider listing in `GET /config` is covered elsewhere (`config.contract.test.ts`).

## Key elements
- **`setupTestDb()`**: sets up the real test database for the suite. `afterEach` restores real timers.
- **`unverifiedOAuthProvider`**: a copy of `fakeOAuthProvider` named `fake-unverified`. Its `exchangeCode` returns `emailVerified: false`.
- **`beforeAll` registration**: registers `fake` and `fake-unverified` via `registerOAuthProvider`. Production seeds no `fake` entry, so the suite adds it itself.
- **`attemptCookies(start)`**: builds a `Cookie` header from the start response's `__Host-oauth_state` and `__Host-oauth_verifier` cookies. A callback needs both.
- **`describe('GET /account/oauth/:provider')`**: covers these behaviors.
  - Unknown provider returns 404 `application/problem+json`.
  - A 302 redirect to the callback URL sets the state and verifier cookies (300s Max-Age, HttpOnly, SameSite=Lax).
  - A same-origin `continue` and a valid `locale` are each saved as their own cookie.
  - An invalid `continue` or `locale` is dropped. Invalid `continue` values tested: protocol-relative, absolute URL, no leading slash.
- **`describe('GET /account/oauth/:provider/callback')`**: covers these behaviors.
  - Unknown provider returns 404.
  - Missing state cookie, mismatched state, or missing verifier returns 400, and the state cookie is cleared.
  - Planted unprefixed `oauth_state` / `oauth_verifier` cookies are ignored.
  - A successful round trip returns a 302 to `http://localhost:8080/oauth/callback`. It sets `__Host-session`, `isAuth` and `__Host-device`, and creates a verified user with terms accepted (version `'1'`).
  - Session cookies carry no `max-age` or `expires`.
  - State and verifier cookies are cleared after success.
  - An unverified provider email redirects with `error=email_unverified` and sets no session.
  - Banned or soft-deleted linked accounts redirect with `error=provider_error` and no session.
  - A saved `continue` or `locale` is carried into the frontend redirect and its cookie is cleared.

## Relationships
- `scenarios/support/doubles/oauth-fake.ts`: supplies `fakeOAuthProvider`, which the suite wraps and registers.
- `src/modules/account/oauth/providers/index.ts`: supplies `registerOAuthProvider`, used to inject the test providers.
- `tests/support/http.ts`: supplies `api()`, plus `bearerForCookie` and `staleBearerFor`, which are imported.
- `tests/support/cookies.ts`: supplies `setCookie` and `cookieHeader` for reading and replaying cookies.
- `src/modules/users/tests/factories.ts`: supplies `createUser` and `userRepository`, used to seed accounts and assert on created users. The suite also calls `linkOAuthAccount` on that repository to link a provider identity to a seeded account.
- `src/modules/users/repository.ts`: the users repository module behind that `userRepository`.
- `tests/support/setup-test-db.ts`: supplies `setupTestDb`.
- `tests/support/contract.ts`: pulled in by the side-effect import `@tests/contract`.
- `tests/support/totp.ts` (`codeFor`), `src/modules/account/tests/factories.ts` (`mintSession`) and `src/modules/account/tests/contract/support.ts` (`claimedAmr`): imported, but not used in the visible portion of the file.

## Notes
- `fakeLogin(...)` is called in the visible tests but defined in the part of the file not shown here. It appears to take an optional second argument, the provider name.
- State cookies are cleared even on failed callbacks, so a retry cannot replay the same state.
- A missing verifier must fail closed with a 400 instead of redeeming the code without PKCE.
- Banned and deleted accounts are deliberately indistinguishable from other provider errors, so the caller learns nothing about account state.
