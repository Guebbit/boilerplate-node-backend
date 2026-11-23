---
source: src/modules/account/tests/integration/oauth-provider-route.test.ts
source_sha256: 2a4cdaa06dd81fe47d7d1dcde1e8ec7bc0f753922651031b72051e7ec50454f1
context_sha256: f5fa0b3729c213bd6be36cfce0d2a8ff2f75e423e914d874a9bd668c71f3f130
generated_at: 2026-11-22T03:57:59.438493+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/integration/oauth-provider-route.test.ts

## Purpose
Integration test for the OAuth callback route (`GET /account/oauth/{google,github}/callback`) using the real Google and GitHub providers, with `fetch` mocked at the providers' servers. It covers what unit tests cannot see: the redirect URI is built from `NODE_URL` and the request's raw query, so a forged `Host` can't change it, and foreign, missing or repeated parameters fail the login. It also checks how the callback spends the credential rate-limit budgets.

## Key elements
- `setupTestDb()` is called at module level. `beforeEach` sets the environment (`NODE_URL`, `NODE_FRONTEND_URL`, outbox mail transport, Google and GitHub client ids and secrets). `afterEach` calls `jest.restoreAllMocks()`.
- `googleIdToken()` signs an RS256 Google ID token with `jose`, using a key pair generated in `beforeAll`.
- `mockProviders(idToken)` spies on `globalThis.fetch` and answers the Google token endpoint, the GitHub access-token endpoint, `/user/emails` and `/user`. Any other URL rejects with "unexpected fetch". It returns the spy.
- `start(provider)` hits `/account/oauth/:provider`, expects a 302, and returns the `state` from the redirect's `location` header plus the `__Host-oauth_state` and `__Host-oauth_verifier` cookies.
- `extraQuery(provider)` appends Google's `iss` parameter (RFC 9207) to the callback query for Google only.
- `describe.each(['google','github'])` has two cases:
  - A successful sign-in with a forged `Host: evil.example` and `X-Forwarded-Proto: http`. It asserts the token request's `redirect_uri` is `${API_BASE}account/oauth/<provider>/callback`.
  - A repeated `code` redirects with `error=provider_error` and makes no provider request.
- The Google issuer check asserts that a wrong or missing `iss` fails the login with `error=provider_error` and makes no fetch.
- `addressRemaining(response)` reads `r=` for `"credentials-address"` from the `RateLimit` header.
- `addressCost(callback, cookies)` fires two probe requests and returns the difference in remaining address budget.
- `FORGED_COOKIES` and `githubCallback(login)` are helpers for the budget tests.
- The budget tests assert the following:
  - A forged cookie pair with `?error=` costs 1.
  - A garbage code that reaches the provider exchange (fetch answered `invalid_grant`) costs 1, for both providers.
  - A successful callback costs 0.

## Relationships
- `@tests/http`: `api()` supplies the HTTP client for every request.
- `@tests/setup-test-db`: `setupTestDb()` prepares the database.
- `@tests/environment`: `setEnvironment()` configures the env vars per test.
- `@tests/cookies`: `cookieHeader()` extracts the state and verifier cookies from the login-start response.

## Notes
- The success case for both providers uses `mockProviders(await googleIdToken())`. The ID token is only used by the Google branch.
- The `addressCost` comment says the limiter writes `r=` before the handler runs and a refund lands after the response. That is why a second probe request is needed to see the first one's cost.
- The budget tests send forged cookies (`x`/`y`). The comment says both state and verifier checks only compare the cookie to the query, so no real login is needed to reach the error and exchange paths.
