---
source: src/modules/account/tests/integration/oauth-provider-route.test.ts
sha256: 1d377ca7736d54d35839a9237aaca6baa6eec0c88355ca93cac877a4c7f09cc8
generated_at: 2026-10-14T09:11:57.678332+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/oauth-provider-route.test.ts

## Purpose

Integration test for the OAuth callback route (`GET /account/oauth/:provider/callback`) that exercises the real Google and GitHub library code paths with `fetch` mocked only at the provider's own servers. It pins two things unit tests cannot: the redirect URI sent to the token endpoint is always built from `NODE_URL` (immune to a forged `Host` header), and a foreign, missing, or repeated query parameter causes a hard login failure rather than being silently dropped.

## Key elements

- **`mockProviders(idToken)`** — Stubs `globalThis.fetch` by URL prefix, returning canned token/user responses for both Google and GitHub endpoints. Returns the spy so tests can inspect the exact `redirect_uri` and `code` sent.
- **`googleIdToken()`** — Signs an RS256 ID token (issuer `accounts.google.com`, aud = `GOOGLE_CLIENT_ID`) using the key pair generated in `beforeAll`.
- **`start(provider)`** — Calls `GET /account/oauth/:provider`, asserts the 302, and extracts the CSRF `state` plus the `oauth_state` / `oauth_verifier` cookies needed for the callback.
- **`extraQuery(provider)`** — Appends the RFC 9207 `iss` query parameter for Google; returns `''` for GitHub.
- **`describe.each(['google','github'])`** block — Two cases: (1) a forged `Host: evil.example` + `X-Forwarded-Proto: http` still yields `redirect_uri` rooted at `API_BASE`; (2) a repeated `code` parameter rejects before any provider call.
- **`describe` (Google issuer check)** — Two cases: a foreign `iss` and a missing `iss` both short-circuit to `error=provider_error` with zero outbound fetches.

## Relationships

- **`tests/support/http.ts`** — `api()` provides the HTTP client (method, headers, cookie injection) used to drive the route under test.
- **`tests/support/environment.ts`** — `setEnvironment()` resets `NODE_URL`, `NODE_FRONTEND_URL`, and the OAuth client-ID/secret vars in `beforeEach`.
- **`tests/support/cookies.ts`** — `cookieHeader()` extracts the `oauth_state` and `oauth_verifier` values from the start-response `Set-Cookie` header.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module level to provision a clean database for the test run.

## Notes

- The test deliberately sets `Host: evil.example` and `X-Forwarded-Proto: http` on the callback request to prove the redirect URI is **not** derived from the incoming request headers.
- Google's RFC 9207 `iss` parameter is present in the redirect for the Google case but absent for GitHub; the code under test must validate it only for Google.
- `jest.restoreAllMocks()` in `afterEach` is the only mock teardown; the key pair from `generateKeyPair` is created once in `beforeAll` and shared across all cases.
- The test asserts `spy` was **not** called on failure paths, confirming the route rejects before contacting the provider.
