---
source: src/modules/account/tests/integration/oauth-provider-route.test.ts
sha256: e5a9dfee9b6cdb83d55d7baed9d8da5437ee044ec1b11a9541e83c39ccaba154
generated_at: 2026-11-08T04:39:13.077798+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/oauth-provider-route.test.ts

## Purpose

Integration test for the OAuth callback route (`GET /account/oauth/:provider/callback`) that exercises the real Google and GitHub provider logic with `fetch` mocked only at the provider-server boundary. It pins two invariants invisible to unit tests: (1) the `redirect_uri` sent to the provider's token endpoint is always derived from `NODE_URL`, not the request's `Host` header, and (2) a malformed query string (repeated param, foreign/missing issuer) causes an immediate login failure rather than a silent drop.

## Key elements

- **`mockProviders(idToken)`** — Spies on `globalThis.fetch` and routes calls to the four known provider URLs (Google token, GitHub token, GitHub `/user/emails`, GitHub `/user`). Any other URL causes a rejection, acting as an "unexpected network call" guard.
- **`googleIdToken()`** — Signs a JWT (RS256) with the expected `iss`, `aud`, `sub`, `email` claims; used as the ID token returned by Google's mocked token endpoint.
- **`start(provider)`** — Performs the initial `GET /account/oauth/:provider` call, extracts the CSRF `state` and the two `__Host-` cookies the callback must present.
- **`extraQuery(provider)`** — Appends the URL-encoded `iss` parameter that Google adds per RFC 9207 (empty for GitHub).
- **`describe.each(['google', 'github'])` block** — Two cases: (a) login succeeds and the token-exchange body contains the correct `redirect_uri` even when `Host` is spoofed; (b) a repeated `code` param fails the login and no provider call is made.
- **RFC 9207 issuer-check block** — Two cases for Google only: a foreign `iss` and a missing `iss` both fail the login before any provider call.
- **Constants** — `API_BASE`, `FRONTEND`, `GOOGLE_CLIENT_ID`, `GOOGLE_ISS` set the deployment context for every test.
- **`signing`** — RS256 key pair generated once in `beforeAll`; used to produce well-formed ID tokens.

## Relationships

- **`tests/support/http.ts`** — provides the `api()` helper used to issue every HTTP request in the test.
- **`tests/support/environment.ts`** — `setEnvironment()` is called in `beforeEach` to configure `NODE_URL`, `NODE_FRONTEND_URL`, and all OAuth client-ID/secret variables per test.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module scope to provision a clean database for session/account writes during the callback.
- **`tests/support/cookies.ts`** — `cookieHeader()` extracts the two `__Host-oauth_*` cookies from the `start()` response so they can be replayed on the callback request.

## Notes

- The test asserts on the **body** of the token-exchange request by inspecting `spy.mock.calls` and parsing the `URLSearchParams` body — it does not assert on the response shape alone.
- `jest.restoreAllMocks()` in `afterEach` is the only mock cleanup; there is no explicit un-spy, so any new spy added mid-test would leak.
- The issuer (RFC 9207) check is **Google-specific**; the `describe.each` block parameterizes both providers, but the issuer sub-describe targets only the Google route.
- `googleIdToken()` is returned as a string (the signed compact JWT) and embedded in Google's mocked token response; GitHub's mocked endpoints do not use it.
