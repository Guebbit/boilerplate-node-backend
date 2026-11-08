---
source: tests/integration/journeys/social-login-with-a-second-factor.test.ts
sha256: 6e9ee2a51cc0623ec95eb6bb2167c33e8c263b7eec810ec9674442d24dcfed73
generated_at: 2026-11-08T09:40:48.532966+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/journeys/social-login-with-a-second-factor.test.ts

## Purpose

End-to-end integration test for the "social login + TOTP second factor" journey. It verifies that a second sign-in through an OAuth provider does **not** yield a session on its own: the callback must leave an MFA challenge cookie, the user must answer it with a valid TOTP code, and only then is a usable session issued. It also confirms the challenge is single-use.

## Key elements

- **`socialSignIn`** (local helper) — performs one full start → callback round-trip against `/account/oauth/fake`, manually forwarding the `__Host-oauth_state` and `__Host-oauth_verifier` cookies that supertest would otherwise drop over plain HTTP.
- **`beforeAll`** — registers the `fake` provider via `registerOAuthProvider` so the app's OAuth router recognises it.
- **`setupTestDb()`** (module-level call) — provisions a clean database for the test.
- **Main `it` block** — exercises the full sequence: first social sign-in (creates verified account) → TOTP setup + confirm → second social sign-in (expects `mfaRequired=1`, no session, a `__Host-oauth_mfa_challenge` cookie) → wrong code rejected (422) → correct code accepted (200, session issued) → session verified against `/account`, `/account/oauth/links`, `/account/sessions` → challenge replay rejected (401).

## Relationships

| Neighbor | Interaction |
|---|---|
| `scenarios/support/doubles/oauth-fake.ts` | Supplies `fakeOAuthProvider`, the in-process OAuth server the test drives. |
| `src/modules/account/oauth/providers/index.ts` | Exports `registerOAuthProvider`, called in `beforeAll` to wire the fake into the app. |
| `tests/support/contract.ts` | Side-effect import; establishes global assertion/contract helpers before tests run. |
| `tests/support/http.ts` | Provides `api()` (supertest wrapper) and `bearerForCookie` (cookie → Bearer token). |
| `tests/support/cookies.ts` | Provides `cookieHeader` (builds a `Cookie` header value) and `setCookie` (extracts a named cookie from a response). |
| `tests/support/body-of.ts` | `bodyOf` validates and extracts a response body against a Zod schema (`GetAccount200Response`, etc.). |
| `tests/support/setup-test-db.ts` | `setupTestDb` creates/seeds the test database. |
| `tests/support/totp.ts` | `codeFor(secret, step)` generates a TOTP code at a given time-step offset, used for setup (step 0) and login (step 1). |

## Notes

- **`__Host-` cookies are forwarded manually.** The comment on `socialSignIn` explains why: supertest's cookie-jar does not replay `__Host-`-prefixed cookies over plain HTTP. Any new `__Host-` cookie the app sets must be picked up with `setCookie` and re-sent via `.set('Cookie', …)`.
- **TOTP time-step offsets.** Setup uses `codeFor(secret, 0)`; the second sign-in and the replay attempt both use `codeFor(secret, 1)`. This keeps the codes in the "next" 30-second window relative to setup, which the server accepts.
- **Challenge is single-use.** The final assertion replays the same challenge cookie with a valid code and expects 401, confirming the server consumed it with the first successful 2FA login.
