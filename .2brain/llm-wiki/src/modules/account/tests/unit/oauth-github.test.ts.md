---
source: src/modules/account/tests/unit/oauth-github.test.ts
sha256: 32dbd30cbcd205efa6966d3a01ba7a5b64e8838eba6c1038786245f61e42625d
generated_at: 2026-09-23T18:15:50.075689+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/oauth-github.test.ts

## Purpose

Unit tests for the GitHub OAuth provider. Verifies that `isOAuthProviderConfigured` reflects environment state, that `authorizeUrl` produces a correct GitHub consent URL (client id, redirect, state, PKCE), and that `exchangeCode` correctly maps GitHub's three-API-call token exchange into a normalized identity — including error paths (missing `id`, unverified email, no primary email, token-exchange failure, hung requests).

## Key elements

- **`jsonResponse(body, ok?)`** – Local helper that fabricates a minimal `Response` object for `fetch` mocking; `ok: false` simulates a 400.
- **`originalEnvironment`** – Captures the developer's real `NODE_OAUTH_GITHUB_*` env vars so `afterEach` can restore them (deleting the key if it was originally absent).
- **`beforeEach` / `afterEach`** – Set the test `CLIENT_ID`/secret, restore env, and call `jest.restoreAllMocks()`.
- **`describe('github provider configuration')`** – Asserts `isOAuthProviderConfigured('github')` flips with the two env vars.
- **`describe('githubOAuthProvider.authorizeUrl')`** – Parses the returned URL and checks origin, `client_id`, `redirect_uri`, `state`, `scope` (contains `user:email`), `code_challenge`, and `code_challenge_method=S256`.
- **`describe('githubOAuthProvider.exchangeCode')`** – Covers: happy-path identity mapping (primary verified email, name, avatar), name fallback to `login`, unverified-email surfacing, rejection when no primary email, token-exchange error body, non-2xx profile response, missing `id` (guards against `providerId === "undefined"`), and AbortSignal timeout on a hung fetch (uses `jest.useFakeTimers` + a signal-aware `fetch` stub).

## Relationships

- **`src/modules/account/oauth/config.ts`** – Imports `isOAuthProviderConfigured` to verify the provider is reported configured/unconfigured based on env vars.
- **`src/modules/account/oauth/providers/github.ts`** – Imports `githubOAuthProvider` and exercises its `authorizeUrl` and `exchangeCode` methods; mocks `globalThis.fetch` to simulate the three GitHub API calls (`/oauth/token`, `/user`, `/user/emails`) the provider makes internally.

## Notes

- The `/user` and `/user/emails` calls fire concurrently (`Promise.all`), so every test case must queue **three** mock responses even when only one call's failure is under test.
- The timeout test stubs `fetch` to only settle when the request's `AbortSignal` fires — this proves the signal actually reaches the outgoing request rather than merely asserting a timer exists.
- `jsonResponse` is file-local; it is not a shared test utility.
- The B15 inline comments document two specific regression bugs this file guards against (missing `id` colliding all accounts onto `"undefined"`, and absent fetch timeouts hanging the callback).
