---
source: src/modules/account/oauth/providers/client.ts
source_sha256: 5d10111ea68dae084f6ab10311fdb89483c1eb28a91703357c3ec45bc0fd5f8b
context_sha256: 5dd5d36effb0abd8121f10bd121482ecb391b8e8970863bb506606991fc984d5
generated_at: 2026-11-22T03:32:07.037130+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/oauth/providers/client.ts

## Purpose
Shared layer on top of `openid-client` for the OAuth provider adapters. It supplies one hardened `fetch` used for every provider call and turns a provider's statically written server description into a client `Configuration`. Endpoints are never discovered over the network, so a login has no extra request to fail or be spoofed.

## Key elements
- `providerFetch` (internal): the `customFetch` installed on every configuration. It adds a deadline (`AbortSignal.timeout(OAUTH_FETCH_TIMEOUT_MS)`, combined with the library's own signal via `AbortSignal.any`) and sets `redirect: 'error'`. It reads the body through `readCappedText` with `DEFAULT_BODY_CAP_BYTES` and returns a fresh `Response` with the same status, statusText and headers.
- `configurationFor(name, server)`: looks up credentials with `getOAuthCredentials(name)` and builds a `client.Configuration`. The client ID falls back to `''` when unset. The secret is passed as a string, so it is sent as a `client_secret_post` body field. It then sets `providerFetch` as the configuration's `customFetch`. The result is not memoised, so a provider becomes usable as soon as its variables are set.
- `authorizationUrlFor(configuration, { redirectUri, scope, state, codeChallenge })`: builds the consent-screen URL string with `buildAuthorizationUrl`. It always uses `code_challenge_method=S256`.
- `redeemCode(configuration, callbackUrl, expected)`: calls `authorizationCodeGrant` with the full callback URL, `expected.state` and `expected.codeVerifier`. The library validates the authorization response (one `code`, state, `error=`, `iss` when required) and, for OpenID providers, verifies the ID token. It throws if any check fails or the provider refuses the code.

## Relationships
- `../config` (`src/modules/account/oauth/config.ts`): supplies `getOAuthCredentials` and `OAUTH_FETCH_TIMEOUT_MS`.
- `@infrastructure/http/read-capped-body` (`src/infrastructure/http/read-capped-body.ts`): supplies `readCappedText` and `DEFAULT_BODY_CAP_BYTES` for the body cap.
- `./port` (`src/modules/account/oauth/providers/port.ts`): supplies the `OAuthExpectation` type (`state`, `codeVerifier`) taken by `redeemCode`.
- `./github` and `./google` (`src/modules/account/oauth/providers/github.ts` and `google.ts`): the two adapters that share this module. They supply their own static server metadata to `configurationFor` and use the URL and redeem helpers.
- `src/infrastructure/config/fields.ts` is a graph neighbor, but this file does not use it directly.

## Notes
- Any redirect from a provider is an error, and responses over the byte cap fail rather than being truncated.
- Because the body is buffered as text before being rewrapped, `providerFetch` returns text-based `Response`s only.
