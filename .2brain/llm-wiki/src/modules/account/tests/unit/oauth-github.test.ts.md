---
source: src/modules/account/tests/unit/oauth-github.test.ts
sha256: 614cf5b0166051511ca611197584ab2df945038443ee09e7dd392d4dd6aec9b9
generated_at: 2026-11-14T19:15:28.740677+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/oauth-github.test.ts

## Purpose
Unit-test suite for the GitHub OAuth provider: verifies the authorize-URL construction (client id, PKCE, scope, redirect) and the three-call `exchangeCode` flow (token → user → emails), plus the env-var configuration gate. `fetch` is mocked globally once per call, in provider order.

## Key elements

- **`jsonResponse(body, ok)`** – Helper that returns a real `Response.json(...)` with a 200 or 400 status; used to queue mock `fetch` results.
- **`exchange()`** – Shorthand for `githubOAuthProvider.exchangeCode(CALLBACK, EXPECTED)` so each test reads as a single action.
- **`describe('github provider configuration')`** – Asserts `isOAuthProviderConfigured('github')` flips true/false with the two env vars.
- **`describe('githubOAuthProvider.authorizeUrl')`** – Builds the URL and checks origin, `client_id`, `redirect_uri`, `state`, `scope`, `code_challenge`, `code_challenge_method=S256`.
- **`describe('githubOAuthProvider.exchangeCode')`** – The main suite (10 cases) covering:
  - Identity resolution (primary email, `emailVerified`, name fallback to `login`).
  - Token-endpoint request shape (URL, form body fields, `accept` header).
  - State-mismatch rejection (no fetch issued).
  - `redirect: 'error'` on all three calls.
  - Byte-cap rejection (`cause.message` contains "longer than").
  - Error-token, non-2xx profile, missing-`id`, and timeout/abort behaviour.

## Relationships

- **`src/modules/account/oauth/config.ts`** – Imports `isOAuthProviderConfigured` to assert the provider is gated on both `NODE_OAUTH_GITHUB_CLIENT_ID` and `NODE_OAUTH_GITHUB_CLIENT_SECRET`.
- **`src/modules/account/oauth/providers/github.ts`** – Imports `githubOAuthProvider`; the entire suite exercises its `authorizeUrl` and `exchangeCode` methods.
- **`tests/support/environment.ts`** – Imports `setEnvironment` to inject/clear the two env vars in `beforeEach`/`afterEach`.

## Notes

- **Parallel user+emails fetch:** the provider calls `/user` and `/user/emails` together (`Promise.all`), so every test must queue *two* mock responses after the token, even when only one call's failure is under test.
- **Byte-cap test** uses a raw `Response` (not `Response.json`) to produce a body exceeding 1 MiB; the provider's cap error surfaces on `error.cause.message`.
- **Timeout test** replaces `fetch` with a promise that rejects only on `AbortSignal` abort, then uses `jest.useFakeTimers()` + `runAllTimersAsync` to prove the provider's own timeout triggers the signal.
- **`providerId` is a string** (`'42'`), and a dedicated test guards against the `String(undefined)` → `"undefined"` collision when the profile omits `id`.
- **`redirect: 'error'`** is asserted on every one of the three `fetch` calls—no redirect-following is permitted.
