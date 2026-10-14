---
source: src/modules/account/tests/unit/oauth-github.test.ts
sha256: 68641bccb0b2d97c1092db89518f813d262575eedd1020c103d8592cdc5687a3
generated_at: 2026-10-14T09:21:14.681797+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/oauth-github.test.ts

## Purpose

Unit tests for the GitHub OAuth provider. Verifies that `authorizeUrl` emits the correct consent-screen parameters and that `exchangeCode` performs the three-call token exchange (token → user → emails) with the right request shape, response handling, and failure paths. `fetch` is mocked throughout, queued in the exact order the provider issues its calls.

## Key elements

- **`jsonResponse(body, ok)`** — Helper returning a real `Response` via `Response.json()`, so the provider's byte-cap stream path is exercised rather than bypassed.
- **`exchange()`** — Shorthand for `githubOAuthProvider.exchangeCode(CALLBACK, EXPECTED)`; every exchange-case starts from this.
- **`describe('github provider configuration')`** — Asserts `isOAuthProviderConfigured('github')` is true with both env vars, false with either missing.
- **`describe('githubOAuthProvider.authorizeUrl')`** — Checks origin, `client_id`, `redirect_uri`, `state`, `scope` (contains `user:email`), `code_challenge`, and `code_challenge_method=S256`.
- **`describe('githubOAuthProvider.exchangeCode')`** — The bulk of the file. Covers:
  - Happy-path identity resolution (primary email, name, avatar).
  - Token-endpoint request shape (URL, `Accept` header, form body fields including `client_secret`).
  - State mismatch → reject before any network call.
  - Name fallback to `login` when `name` is null.
  - Unverified primary email surfaces `emailVerified: false`.
  - No primary email → reject.
  - `redirect: 'error'` on all three fetch calls (no redirect-following).
  - Oversized response → reject via byte-cap error in `cause`.
  - Token endpoint returning an error object → reject.
  - Non-2xx on `/user` → reject.
  - Missing `id` in profile → reject (guards against `String(undefined)` → `"undefined"` providerId collision).
  - Hung GitHub → aborts via `AbortSignal` within a timeout (uses fake timers + a fetch stub that only settles on abort).

## Relationships

- **`src/modules/account/oauth/config.ts`** — Imports `isOAuthProviderConfigured` to test the "is GitHub OAuth enabled" gate.
- **`src/modules/account/oauth/providers/github.ts`** — The module under test; imports `githubOAuthProvider` and exercises both `authorizeUrl` and `exchangeCode`.
- **`tests/support/environment.ts`** — Imports `setEnvironment` to set/clear `NODE_OAUTH_GITHUB_CLIENT_ID` and `NODE_OAUTH_GITHUB_CLIENT_SECRET` around each test.

## Notes

- **`/user` and `/user/emails` fire concurrently** (via `Promise.all` inside the provider). Any test that mocks only the first of those two calls will hang; both responses must be queued even if only one is the subject of the assertion.
- **Byte-cap test inspects `cause.message`**, not the top-level error message, because the library wraps the underlying fetch error.
- **Timeout test** does not assert a timer value; instead it stubs `fetch` to reject only when the request's own `AbortSignal` fires, proving the signal actually propagates to the request.
- **`Response.json()` is used deliberately** (not a plain object) so the provider's stream-reading code path with its byte cap is real, not mocked away.
- **`afterEach` calls `jest.restoreAllMocks()`**, so each test is fully isolated without manual spy teardown.
