---
source: src/modules/account/oauth/providers/client.ts
sha256: 38a8074a7d2e1ffbf43c2ccbe439c6e537c1b584fdbfff07acc92272607e0450
generated_at: 2026-10-14T08:43:12.130995+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/oauth/providers/client.ts

## Purpose

Shared OAuth client plumbing on top of `openid-client`. It centralises the one `fetch` wrapper every provider call goes through (deadline, body cap, no redirects) and the helpers that turn a provider's static server description into a working configuration, authorization URL, and code redemption. Both provider adapters (GitHub, Google) import from here rather than re-implementing this logic.

## Key elements

- **`providerFetch`** (`client.CustomFetch`) — the sole outbound HTTP channel for token exchange and key-set download. Enforces three limits `openid-client` does not set itself: an `AbortSignal.timeout` deadline (merged with the library's own signal via `AbortSignal.any`), `redirect: 'error'` so a 302 is never followed, and a byte-capped body read (via `readCappedText`) re-wrapped as a fresh `Response`.
- **`configurationFor(name, server)`** — resolves the deployment's `clientId`/`clientSecret` for the given registry key, builds an `openid-client` `Configuration` (passing the secret as a string so it is sent as `client_secret_post`), and attaches `providerFetch`. Not memoised; call it each time variables are set.
- **`authorizationUrlFor(configuration, parameters)`** — calls `buildAuthorizationUrl` with `redirect_uri`, `scope`, `state`, `code_challenge`, and a fixed `code_challenge_method: 'S256'`. Returns the consent-screen URL as a string.
- **`redeemCode(configuration, callbackUrl, expected)`** — delegates to `authorizationCodeGrant`, passing `expectedState` and `pkceCodeVerifier` from the `OAuthExpectation`. The library validates the redirect (one code, matching state, no `error=`, `iss` check) and, for OIDC providers, verifies the ID token before resolving.

## Relationships

- **`providers/port.ts`** — imports the `OAuthExpectation` type (shape of `state` + `codeVerifier` kept per attempt).
- **`oauth/config.ts`** — imports `getOAuthCredentials` (resolves client-id/secret per provider name) and `OAUTH_FETCH_TIMEOUT_MS` (the deadline constant).
- **`infrastructure/http/read-capped-body.ts`** — imports `readCappedText` and `DEFAULT_BODY_CAP_BYTES` to enforce the response-body size limit inside `providerFetch`.
- **`providers/github.ts` / `providers/google.ts`** — the two consumers; each declares its static endpoints and calls `configurationFor`, `authorizationUrlFor`, and `redeemCode` from this module.

## Notes

- Provider endpoints are **static** (written in each provider file); no discovery request is ever made. A login therefore has no extra network round-trip that could fail or be spoofed.
- The `client_secret_post` grant type (secret in the body) is what both Google and GitHub accept; no `client_secret_basic` header path is used.
- PKCE is offered as **S256 only**; no `plain` fallback.
- `configurationFor` is intentionally **not** memoised — it is expected to be called once per request when the deployment's variables are available.
