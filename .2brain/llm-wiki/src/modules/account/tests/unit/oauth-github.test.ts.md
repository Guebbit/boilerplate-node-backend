---
source: src/modules/account/tests/unit/oauth-github.test.ts
sha256: 68641bccb0b2d97c1092db89518f813d262575eedd1020c103d8592cdc5687a3
generated_at: 2026-11-08T04:47:52.508448+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/oauth-github.test.ts

## Purpose

Unit tests for the GitHub OAuth provider: verifies that `authorizeUrl` produces the correct consent-screen URL with PKCE parameters, and that `exchangeCode` performs the three-call token exchange (token → user → emails) correctly, handling identity extraction, error cases, security constraints, and timeouts. All `fetch` calls are mocked individually in the exact order the provider issues them.

## Key elements

- **`CLIENT_ID` / `REDIRECT_URI`** – Shared constants asserted in both the authorize URL and the token-exchange body.
- **`jsonResponse(body, ok?)`** – Builds a real `Response` via `Response.json`, because the provider reads bodies through a stream with a byte cap. `ok = false` simulates a 400.
- **`CALLBACK` / `EXPECTED`** – Fixed callback URL (`?code=a-code&state=the-state`) and the matching `{ state, codeVerifier }` pair every `exchangeCode` case starts from.
- **`TOKEN`** – Canonical success shape for the token endpoint.
- **`exchange()`** – One-liner alias for `githubOAuthProvider.exchangeCode(CALLBACK, EXPECTED)`, used in every exchange test.
- **`beforeEach`** – Sets both `NODE_OAUTH_GITHUB_CLIENT_ID` and `NODE_OAUTH_GITHUB_CLIENT_SECRET` via `setEnvironment`.
- **`afterEach`** – `jest.restoreAllMocks()`.
- **Three `describe` blocks** – `github provider configuration` (2 cases), `githubOAuthProvider.authorizeUrl` (1 case), `githubOAuthProvider.exchangeCode` (12 cases covering success, PKCE body, state rejection, name fallback, unverified email, missing primary, redirect policy, byte cap, token error, non-2xx profile, missing `id`, and timeout).

## Relationships

- **`src/modules/account/oauth/config.ts`** – Imports `isOAuthProviderConfigured` to assert the provider is "configured" only when both env vars are present, and "not configured" when either is removed.
- **`src/modules/account/oauth/providers/github.ts`** – Imports `githubOAuthProvider`; the sole system under test. Exercises `authorizeUrl` and `exchangeCode`.
- **`tests/support/environment.ts`** – Imports `setEnvironment` to set or clear the two `NODE_OAUTH_GITHUB_*` variables around each test case.

## Notes

- **Mock ordering is positional.** Each exchange test queues exactly three `mockResolvedValueOnce` calls (token, user, emails) in that order; reordering or adding a call silently breaks the wrong assertion.
- **`/user` and `/user/emails` fire concurrently** (`Promise.all`), so even a test focused on one endpoint's failure must still queue a response for the other.
- **Responses are real `Response` objects, not plain objects.** The provider reads the body as a stream with a hard byte cap; passing a plain object would skip that path.
- **The timeout test** stubs `fetch` to hang until the request's own `AbortSignal` fires, combined with `jest.useFakeTimers()` / `jest.runAllTimers()`. This proves the provider attaches an abort signal rather than merely existing a timer somewhere.
- **The byte-cap test** asserts the rejection's `cause.message`, because the provider wraps the stream-cap error in a higher-level rejection.
- **The "no `id`" test** guards against a real-world bug: `String(undefined)` would silently produce `providerId: "undefined"` for every account whose GitHub profile lacked `id`.
