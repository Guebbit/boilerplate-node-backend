---
source: src/modules/account/tests/contract/oauth.contract.test.ts
sha256: e9108718ff5649c548f3c8f4c23827b9145e88628cb96f04b8cbf7bcf1f5f39b
generated_at: 2026-09-27T14:33:46.076028+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/contract/oauth.contract.test.ts

## Purpose

Contract tests for the OAuth account surface: the `GET /account/oauth/providers` listing and the full start → callback round trip through the `fake` provider. Exercises the real routes, CSRF cookie, PKCE verifier, and a real database in-process (no browser), mirroring what a Cypress spec would assert against a live server.

## Key elements

- **`attemptCookies(start)`** — extracts `oauth_state` + `oauth_verifier` from a start response's `Set-Cookie` headers and formats them as a single `Cookie` request header for the callback.
- **`fakeLogin(continueTo?)`** — helper that performs one complete start → callback round trip through the fake provider, optionally carrying a `continue` parameter.
- **`beforeAll` / `afterAll`** — enable / disable the demo profile (`enableDemoProfile()`) so the fake provider exists only during this suite.
- **`describe('GET /account/oauth/providers')`** — asserts the fake provider appears in the list.
- **`describe('GET /account/oauth/:provider')`** — 404 for unknown providers; 302 redirect with state/verifier cookies; `continue` cookie validation (rejects protocol-relative, absolute, and slash-less values).
- **`describe('GET /account/oauth/:provider/callback')`** — 404 for unknown providers; 400 on missing/mismatched state; 400 when verifier cookie is absent (PKCE fail-closed); successful round trip creating a user and setting session cookies; `continue` passthrough and cookie clearing; forged-`continue` rejection; idempotent second login (no duplicate user).
- **`describe('... callback — 2FA armed (1b)')`** — after enrolling TOTP on the created account, a second login returns a 2FA challenge redirect (no session cookies) instead of minting a session; completing the TOTP code then mints the session.

## Relationships

- **`src/infrastructure/runtime/demo-profile.ts`** — `enableDemoProfile()` toggles the fake OAuth provider on/off for the duration of the suite.
- **`src/modules/users/repository.ts`** — `userRepository` is used to assert that exactly one user with the demo email exists after login, and that `verifiedAt` is set.
- **`src/modules/users/tests/factories.ts`** — re-exports / constructs the `userRepository` instance used above.
- **`tests/support/contract.ts`** — imported for side-effect; sets up shared contract-test infrastructure (response shape expectations, etc.).
- **`tests/support/cookies.ts`** — `setCookie()` reads a named cookie from a response; `cookieHeader()` formats multiple cookies into a request header string.
- **`tests/support/http.ts`** — `api()` returns the in-process HTTP client used for every request in this file.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises and tears down a real database instance for the suite.
- **`tests/support/totp.ts`** — `codeFor(secret, step)` generates a valid TOTP code for the 2FA challenge tests.

## Notes

- The verifier-missing test deliberately omits only the `oauth_verifier` cookie while still sending `oauth_state`, to assert the callback **fails closed** rather than silently skipping PKCE.
- The forged-`continue` test sends `oauth_continue=//evil.example` directly on the callback request (bypassing the start controller) to verify the callback re-validates the cookie value rather than trusting it by name.
- The second-login idempotency test runs the two attempts **sequentially on purpose** (comment in source) so it tests the "already linked" path, not a concurrent race.
- Tests for "deactivated / soft-deleted account refusing login" and for "admin login audited as plain user" have been moved to `login-paths.contract.test.ts`; only a comment reference remains here.
