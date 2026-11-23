---
source: src/modules/account/tests/unit/oauth-github.test.ts
source_sha256: c05cb8f64a6719dc2b58a39af1d76a1d557a1d77d4accae6d0d64e69b8e1feb9
context_sha256: 778655303025412f374282ee03a8937b5c0d0b853922951e81ead0615779b979
generated_at: 2026-11-22T04:06:36.990123+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/unit/oauth-github.test.ts

## Purpose
Jest unit tests for the GitHub OAuth provider (`src/modules/account/oauth/providers/github.ts`): the authorize URL and the three-call code exchange (token, user profile, emails). Global `fetch` is mocked throughout, with one queued response per call in the order the provider makes them. This keeps the tests offline and pins down the provider's security-relevant behavior.

## Key elements
- **Constants and helpers**
  - `CLIENT_ID`, `REDIRECT_URI`, `CALLBACK` (a URL with `code=a-code&state=the-state`), `EXPECTED` (`state` and `codeVerifier`), and `TOKEN` (a token response) are shared fixtures.
  - `jsonResponse(body, ok)` builds a real `Response` (status 200, or 400 when `ok` is false). A real `Response` is needed because the provider reads the body through a byte-capped stream.
  - `exchange()` runs `githubOAuthProvider.exchangeCode(CALLBACK, EXPECTED)`.
- **Setup/teardown**: `beforeEach` sets the client id and secret through `setEnvironment`. `afterEach` calls `jest.restoreAllMocks()`.
- **`github provider configuration`**: `isOAuthProviderConfigured('github')` is true with both env vars set and false when the client id is missing.
- **`githubOAuthProvider.authorizeUrl`**: checks the URL origin and path (`https://github.com/login/oauth/authorize`) and the query params. The params are `client_id`, `redirect_uri`, `state`, a `scope` containing `user:email`, `code_challenge`, and `code_challenge_method=S256`.
- **`githubOAuthProvider.exchangeCode`** cases:
  - The identity is built from the profile and the primary email: `providerId` is `'42'`, with `emailVerified`, `name` and `imageUrl`.
  - The token request carries `code`, `code_verifier`, `redirect_uri`, `client_id` and `client_secret` in a form body, and sends an `accept: application/json` header.
  - A forged `state` rejects before any `fetch` call.
  - `name` falls back to the login when the profile has none.
  - An unverified primary email is surfaced as `emailVerified: false`.
  - It rejects (`/primary/`) when no email is primary.
  - Every call is made with `redirect: 'error'`, and `fetch` is called exactly 3 times.
  - A response over 1,048,576 bytes is refused, and the "longer than" message is checked on `cause.message`.
  - It rejects on a token-endpoint error body, and on a non-2xx profile response.
  - It rejects (`/id/`) on a profile with no `id`, so `providerId` is never `"undefined"`.
  - A hung GitHub is aborted: with fake timers, `fetch` settles only when the request's own `AbortSignal` fires, which shows the signal reaches the request.

## Relationships
- `src/modules/account/oauth/config.ts`: only `isOAuthProviderConfigured` is imported, for the configuration tests.
- `src/modules/account/oauth/providers/github.ts`: `githubOAuthProvider` (`authorizeUrl`, `exchangeCode`) is the unit under test.
- `tests/support/environment.ts` (imported as `@tests/environment`): `setEnvironment` sets or unsets the `NODE_OAUTH_GITHUB_CLIENT_ID` and `NODE_OAUTH_GITHUB_CLIENT_SECRET` env vars.

## Notes
- Mock order matters. The token call comes first, then `/user` and `/user/emails`. The last two fire together (`Promise.all`), so the non-2xx profile test still queues an emails response.
- Failures from the underlying OAuth library are wrapped, so the byte-cap message is read from `cause`.
- The timeout test calls `jest.useRealTimers()` at the end of the test body, not in `afterEach`.
