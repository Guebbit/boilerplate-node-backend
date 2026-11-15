---
source: src/modules/account/tests/integration/oauth-provider-route.test.ts
sha256: 21a9f772e6593abd8fc4f3aead1a24ead0d2b472b8ab03bd92d509cb18a66758
generated_at: 2026-11-14T19:06:06.713589+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/oauth-provider-route.test.ts

## Purpose

Integration test for `GET /account/oauth/:provider/callback` that exercises the **real** Google and GitHub OAuth logic end-to-end while mocking `fetch` at the provider's own server endpoints. It pins behaviours invisible to unit tests: the redirect URI is always built from `NODE_URL` (not the request `Host`), repeated or foreign query parameters cause a hard failure, the Google `iss` parameter is validated per RFC 9207, and the rate-limit ("address") budget is spent or refunded correctly on each outcome.

## Key elements

- **`mockProviders(idToken)`** — Spies on `globalThis.fetch` and returns canned `Response.json` objects for Google's token endpoint and GitHub's token/user/emails endpoints; any unrecognised URL rejects, catching stray calls.
- **`googleIdToken()`** — Builds a signed RS256 ID token (iss, aud, sub, email) using the `jose` `SignJWT` helper and the module-level `signing` key pair.
- **`start(provider)`** — Performs the initial `GET /account/oauth/:provider`, asserts the 302, and extracts the CSRF `state` plus the `__Host-oauth_state` / `__Host-oauth_verifier` cookie pair.
- **`extraQuery(provider)`** — Appends the RFC 9207 `iss` parameter for Google callbacks (empty for GitHub).
- **`addressRemaining(response)`** — Parses the `"credentials-address";r=<n>` field out of the `RateLimit` response header.
- **`addressCost(callback, cookies)`** — Fires two identical callback requests and returns the difference in remaining budget, measuring the cost of the first.
- **`githubCallback(login)`** — Convenience helper that issues the GitHub callback GET with the state and cookies from a `start` call.
- **`FORGED_COOKIES`** — A hardcoded state/verifier cookie pair used to simulate a mismatched (forged) CSRF pair.
- **`API_BASE`, `FRONTEND`, `GOOGLE_CLIENT_ID`, `GOOGLE_ISS`** — Deployment constants injected via `setEnvironment` in `beforeEach`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `tests/support/http.ts` | Imports `api()` to issue HTTP requests against the running app under test. |
| `tests/support/setup-test-db.ts` | Imports `setupTestDb()` and calls it at module top level so every test runs against a fresh database. |
| `tests/support/environment.ts` | Imports `setEnvironment()` and calls it in `beforeEach` to pin `NODE_URL`, `NODE_FRONTEND_URL`, OAuth client IDs/secrets, and mail transport. |
| `tests/support/cookies.ts` | Imports `cookieHeader()` to extract the `__Host-oauth_state` and `__Host-oauth_verifier` cookies from the login-start response. |

## Notes

- The test mocks `fetch` **after** the app resolves its provider configuration; it never mocks the account module itself. Any `fetch` call to an unrecognised URL is rejected, so a regression that hits an unexpected endpoint fails loudly.
- The rate-limit cost is measured by **two successive requests** because the limiter writes `r=` before the handler runs but refunds after the response is sent — a single response can't show the delta.
- `describe.each(['google', 'github'])` reuses the same test bodies for both providers; the `extraQuery` helper is the only provider-conditional branch (Google's `iss` requirement).
- The `Host: evil.example` + `X-Forwarded-Proto: http` headers in the redirect-URI test are intentional: they verify the route never derives the redirect URI from request headers.
