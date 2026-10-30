---
source: tests/integration/journeys/social-login-with-a-second-factor.test.ts
sha256: 6e9ee2a51cc0623ec95eb6bb2167c33e8c263b7eec810ec9674442d24dcfed73
generated_at: 2026-10-29T06:57:28.750190+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/journeys/social-login-with-a-second-factor.test.ts

## Purpose

End-to-end journey test proving that once a social-sign-in account has a TOTP authenticator armed, the OAuth callback no longer issues a session directly. Instead it returns an MFA challenge cookie, and only a correct TOTP code on `/account/login/2fa` produces the session.

## Key elements

- **`socialSignIn`** (local helper) — performs one full start → redirect → callback round-trip against the fake provider, manually forwarding the `__Host-oauth_state` and `__Host-oauth_verifier` cookies that supertest won't replay over plain HTTP.
- **`beforeAll` block** — registers the fake provider under the name `'fake'` via `registerOAuthProvider`.
- **`it('asks for the code after the provider, and runs the session on the answer')`** — the single test. It (1) creates the account via first social sign-in, (2) arms and confirms TOTP, (3) re-runs social sign-in and asserts a challenge cookie is set with no session, (4) rejects a wrong code (422), (5) accepts the correct code and verifies the resulting bearer can read `/account`, `/account/oauth/links`, and `/account/sessions`, (6) confirms the challenge cookie is single-use (401 on replay).

## Relationships

- **`scenarios/support/doubles/oauth-fake.ts`** — supplies `fakeOAuthProvider`, the stub provider whose callback URL and user profile (`oauth.demo@example.com`) drive the flow.
- **`src/modules/account/oauth/providers/index.ts`** — `registerOAuthProvider` injects the fake into the app's provider registry for the test lifetime.
- **`tests/support/http.ts`** — `api()` builds supertest requests; `bearerForCookie` converts a `__Host-session` cookie value into a Bearer token for subsequent calls.
- **`tests/support/cookies.ts`** — `cookieHeader` extracts named cookies from a response into a `Cookie` header string; `setCookie` reads a single `Set-Cookie` value.
- **`tests/support/body-of.ts`** — `bodyOf` validates a response body against a Zod schema and returns the typed payload.
- **`tests/support/contract.ts`** — side-effect import that installs global contract-test matchers.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` provisions and tears down the test database for the suite.
- **`tests/support/totp.ts`** — `codeFor(secret, step)` computes a TOTP code at a given time-step offset (used as 0 for setup, 1 for login).

## Notes

- Cookies are forwarded manually because supertest's cookie jar does not replay `__Host-`-prefixed cookies over plain HTTP; the `socialSignIn` helper exists solely for this workaround.
- The test uses **time-step 0** for TOTP setup confirmation and **time-step 1** for the login challenge. This avoids a server-side "same code used twice" rejection without needing to wait a real 30-second window.
- The challenge cookie (`__Host-oauth_mfa_challenge`) is **single-use**: the final assertion replays it with a valid code and expects `401`, documenting that it was consumed by the first successful login.
- `setupTestDb()` is called at module scope (not inside `beforeAll`), so it runs synchronously before any test registers.
