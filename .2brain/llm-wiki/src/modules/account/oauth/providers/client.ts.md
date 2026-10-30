---
source: src/modules/account/oauth/providers/client.ts
sha256: 9407686191d108a6be1ec6649f3347049e967a93ed5fe87f93a50721c890ae14
generated_at: 2026-10-29T02:37:08.234031+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/oauth/providers/client.ts

## Purpose

Shared OAuth client layer for every provider adapter, built on top of `openid-client`. It centralises three things that all providers need identically: a hardened `fetch` (deadline, redirect rejection, body-size cap) that every library call goes through, the construction of a provider's `Configuration` from statically-declared endpoints and deployment credentials, and the two OAuth flow steps—building the consent URL and redeeming the authorization code. Endpoints are written down in each provider's own file rather than discovered over the network, so login requires no extra request that could fail or be spoofed.

## Key elements

- **`providerFetch`** (module-private) — The `client.CustomFetch` injected into every configuration. Wraps `fetch` with: a timeout via `AbortSignal.any` (merges the library's own signal with `OAUTH_FETCH_TIMEOUT_MS`), `redirect: 'error'` (any redirect is a hard failure), and a post-fetch body read through `readCappedText` at `DEFAULT_BODY_CAP_BYTES`, re-wrapped in a fresh `Response`.
- **`configurationFor(name, server)`** — Builds an `openid-client` `Configuration` from a provider's static `ServerMetadata` and the deployment's credentials (fetched via `getOAuthCredentials(name)`). Attaches `providerFetch` via `configuration[client.customFetch]`. The secret is passed as the third constructor argument (string), which makes the library send it as `client_secret_post`. Not memoised—call it whenever the provider is configured.
- **`authorizationUrlFor(configuration, parameters)`** — Calls `client.buildAuthorizationUrl` with `redirect_uri`, `scope`, `state`, `code_challenge`, and `code_challenge_method: 'S256'` (the only PKCE method offered). Returns the consent-screen URL as a string.
- **`redeemCode(configuration, callbackUrl, expected)`** — Calls `client.authorizationCodeGrant`, passing the full callback URL (query string intact), `expectedState`, and `pkceCodeVerifier`. The library validates the authorization response (one `code`, `state` match, no `error=`, `iss` check per RFC 9207) and, for OIDC providers, verifies the ID token before returning.

## Relationships

- **`../config`** (`src/modules/account/oauth/config.ts`) — Supplies `getOAuthCredentials` (per-provider `clientId`/`clientSecret`) and the `OAUTH_FETCH_TIMEOUT_MS` constant used by `providerFetch`.
- **`@infrastructure/http/read-capped-body`** (`src/infrastructure/http/read-capped-body.ts`) — Provides `readCappedText` and `DEFAULT_BODY_CAP_BYTES`, the byte-cap mechanism applied to every provider response inside `providerFetch`.
- **`./port`** (`src/modules/account/oauth/providers/port.ts`) — Defines the `OAuthExpectation` type (`state` + `codeVerifier`) that `redeemCode` consumes.
- **`./github`** / **`./google`** (`src/modules/account/oauth/providers/github.ts`, `google.ts`) — Each declares its static `ServerMetadata` and calls `configurationFor`, `authorizationUrlFor`, and `redeemCode` to drive its OAuth flow. They are the primary consumers of every export in this file.
- **`src/infrastructure/config/fields.ts`** — Indirect dependency: `getOAuthCredentials` in `config.ts` reads deployment values defined there, so this file ultimately depends on those field definitions.

## Notes

- **Static endpoints only.** There is no OIDC discovery request; each provider file hard-codes its `ServerMetadata`. Adding a new provider means writing a new endpoints object, not adding a network call.
- **Body is fully buffered.** `providerFetch` reads the entire response body (up to the cap) into a string before re-wrapping it. Streaming or very large token/key-set responses are not supported.
- **`AbortSignal.any` usage.** The timeout and any library-provided signal are combined so whichever fires first aborts the request. The `.filter(...)` guard excludes `undefined` signals before passing the array.
- **PKCE is S256 only.** There is no `plain` option; `code_challenge_method` is always `'S256'`.
- **`client_secret_post` posture.** Because the secret is passed as a string third argument to `Configuration`, it goes in the request body rather than the `Authorization` header. Both Google and GitHub accept this form.
