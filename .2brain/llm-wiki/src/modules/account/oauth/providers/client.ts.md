---
source: src/modules/account/oauth/providers/client.ts
sha256: 9407686191d108a6be1ec6649f3347049e967a93ed5fe87f93a50721c890ae14
generated_at: 2026-11-08T04:12:36.104389+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/oauth/providers/client.ts

## Purpose

Shared OAuth client plumbing used by every provider adapter on top of `openid-client`. It supplies the single `fetch` implementation every provider call goes through (deadline, body cap, no-redirect policy) and the helper that turns a provider's static server metadata into a ready-to-use `client.Configuration`. Because endpoints are hard-coded in each provider file rather than discovered over the network, login flow has no extra request that can fail or be spoofed.

## Key elements

- **`providerFetch`** (module-private) – The `CustomFetch` passed to `openid-client`. Wraps the global `fetch` with three library-independent limits: an `AbortSignal.timeout(OAUTH_FETCH_TIMEOUT_MS)` merged via `AbortSignal.any`, `redirect: 'error'` so any redirect is rejected, and a byte-capped body read (`readCappedText`) before the response is re-wrapped as a fresh `Response`.
- **`configurationFor(name, server)`** (exported) – Builds a `client.Configuration` from a provider's `ServerMetadata` and the deployment's credentials (looked up by registry key via `getOAuthCredentials`). Attaches `providerFetch` as the custom fetch. Returns a new instance on every call (not memoised).
- **`authorizationUrlFor(configuration, parameters)`** (exported) – Calls `client.buildAuthorizationUrl` with `redirect_uri`, `scope`, `state`, `code_challenge`, and hard-codes `code_challenge_method: 'S256'`. Returns the consent-screen URL as a string.
- **`redeemCode(configuration, callbackUrl, expected)`** (exported) – Calls `client.authorizationCodeGrant`, passing `expectedState` and `pkceCodeVerifier` from the `OAuthExpectation`. The library validates `state`, refuses `error=`, checks `iss` (RFC 9207), verifies the ID token for OpenID providers, and throws on any failure.

## Relationships

- **`src/infrastructure/http/read-capped-body.ts`** – Imports `readCappedText` and `DEFAULT_BODY_CAP_BYTES` to enforce the body-size limit inside `providerFetch`.
- **`src/modules/account/oauth/config.ts`** – Imports `getOAuthCredentials` (resolves `clientId`/`clientSecret` by provider name) and the `OAUTH_FETCH_TIMEOUT_MS` constant used for the fetch deadline.
- **`src/modules/account/oauth/providers/port.ts`** – Imports the `OAuthExpectation` type (carries `state` + `codeVerifier`) consumed by `redeemCode`.
- **`src/modules/account/oauth/providers/github.ts` / `google.ts`** – The consumer adapters; each holds its own static `ServerMetadata` and calls `configurationFor`, `authorizationUrlFor`, and `redeemCode` to complete its login flow.
- **`src/infrastructure/config/fields.ts`** – Upstream of `config.ts`; defines the credential fields that `getOAuthCredentials` reads.

## Notes

- `clientSecret` is passed as a string third argument to `client.Configuration`, which causes `openid-client` to send it as a `client_secret_post` body field (accepted by both Google and GitHub).
- Endpoints are **never** discovered over the network; each provider file writes them down statically.
- `configurationFor` is not memoised—a new `Configuration` is constructed each call.
- The PKCE method is fixed to `S256`; no other method is offered.
- `AbortSignal.any` requires Node 20+; it merges the library's own abort signal (if any) with the timeout signal so either one cancels the request.
