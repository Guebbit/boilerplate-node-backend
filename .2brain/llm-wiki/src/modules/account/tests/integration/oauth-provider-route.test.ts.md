---
source: src/modules/account/tests/integration/oauth-provider-route.test.ts
sha256: e5a9dfee9b6cdb83d55d7baed9d8da5437ee044ec1b11a9541e83c39ccaba154
generated_at: 2026-10-29T02:57:59.384734+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/oauth-provider-route.test.ts

## Purpose

Integration test for `GET /account/oauth/:provider/callback` that exercises the real Google and GitHub provider logic while mocking `fetch` at the providers' own servers. It pins two security properties invisible to unit tests: (1) the `redirect_uri` sent to the token endpoint is built from `NODE_URL`, not the request's `Host` header, and (2) a foreign, missing, or repeated query parameter (e.g. `code`, `iss`) causes the login to fail rather than being silently dropped.

## Key elements

- **`mockProviders(idToken)`** — Spies on `globalThis.fetch`, routing calls to Google's token endpoint, GitHub's access-token endpoint, and GitHub's user/email endpoints. Rejects any unexpected URL. Returns the spy so tests can inspect the exact token-endpoint body.
- **`googleIdToken()`** — Builds a properly signed RS256 JWT (issuer, audience = `GOOGLE_CLIENT_ID`, subject, verified email) using the `signing` key pair generated in `beforeAll`.
- **`start(provider)`** — Helper that performs the initial `GET /account/oauth/:provider` call, extracts the `state` param and the two `__Host-` cookies (`__Host-oauth_state`, `__Host-oauth_verifier`) the callback must present.
- **`extraQuery(provider)`** — Appends Google's RFC 9207 `iss` parameter (url-encoded) to the callback URL, or returns empty string for GitHub.
- **`describe.each(['google', 'github'])` block** — Two tests per provider: (a) successful sign-in asserts `redirect_uri` equals `NODE_URL`-based path even when `Host: evil.example` and `X-Forwarded-Proto: http` are set; (b) repeated `code` parameter → 302 to `error=provider_error` with **zero** provider fetch calls.
- **RFC 9207 issuer-check block** — Google-specific: asserts that a missing or foreign `iss` in the callback query fails the login without contacting the provider.

## Relationships

- **`tests/support/http.ts`** — Provides the `api()` helper used to issue requests against the running app server.
- **`tests/support/environment.ts`** — `setEnvironment()` configures `NODE_URL`, `NODE_FRONTEND_URL`, OAuth client IDs/secrets, and mail transport before each test.
- **`tests/support/cookies.ts`** — `cookieHeader()` serialises `__Host-oauth_state` and `__Host-oauth_verifier` from a response into a `Cookie` header string for the callback request.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the test database (called once at module level, before any test runs).

## Notes

- The `signing` key pair is generated once in `beforeAll` (async), so `googleIdToken()` is only safe to call after that hook resolves; all call sites are inside test bodies, which is fine.
- `mockProviders` rejects any `fetch` URL it doesn't recognise, so a regression that adds a new provider endpoint will surface as an unhandled rejection rather than a silent pass.
- The `__Host-` cookie prefix (Secure, `Path=/`, no `Domain`) is load-bearing: the callback handler validates those exact cookie names, and the test relies on the support helper to reproduce them faithfully.
- `GOOGLE_ISS` is url-encoded (`%3A%2F%2F`) to match how the parameter arrives in a real browser redirect, not how a developer might naively write it.
