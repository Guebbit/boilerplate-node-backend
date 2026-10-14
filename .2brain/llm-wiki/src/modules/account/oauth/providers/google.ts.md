---
source: src/modules/account/oauth/providers/google.ts
sha256: d3ff5ffbfe53f3d350ece1b9bff1a36ca5fb2c7cea9f56eb8157b868e75bc207
generated_at: 2026-10-14T08:43:43.996246+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/oauth/providers/google.ts

## Purpose

Implements the Google OAuth/OIDC provider behind the shared `OAuthProvider` port. It builds the authorization URL, exchanges the authorization code for tokens, and extracts the user's identity directly from the verified ID-token claims — avoiding a separate `userinfo` round trip.

## Key elements

- **`googleOAuthProvider`** (exported) — The `OAuthProvider` object registered under the name `'google'`. Exposes `authorizeUrl` and `exchangeCode` conforming to the port interface.
- **`SERVER`** (module-private) — Hardcoded `client.ServerMetadata` (issuer, auth/token endpoints, `authorization_response_iss_parameter_supported: true`). Not fetched at runtime; the `issuer` value is the exact string the library compares against the ID token's `iss` claim.
- **`identityOf`** (module-private) — Validates that the ID token carries a non-empty `sub` and a string `email`, then maps claims (`name`, `picture`, `email_verified`) into the `OAuthIdentity` shape. Throws on missing `sub` or `email`.
- **`PROVIDER_NAME`** (module-private) — The registry key `'google'`; also the value stored on `OAuthAccount.provider`.

## Relationships

- **`./port.ts`** — Imports the `OAuthIdentity` and `OAuthProvider` types that `googleOAuthProvider` must satisfy and that `identityOf` returns.
- **`./client.ts`** — Imports `configurationFor`, `authorizationUrlFor`, and `redeemCode`, the three shared helpers every provider uses to talk to `openid-client`.
- **`./index.ts`** — Re-exports `googleOAuthProvider` so the provider registry can discover it.
- **`tests/unit/oauth-google.test.ts`** — Unit tests for this file's claim-mapping and validation logic.

## Notes

- **No signature check, by design.** The ID token arrives from Google's token endpoint over TLS; OIDC Core §3.1.3.7 step 6 permits omitting the signature check in that trust boundary. The library still validates `iss`, `aud`, `exp`, and `iat`.
- **`email_verified` accepts both boolean and the string `'true'`.** Google's tokens have historically sent the string form; `identityOf` normalises both to a boolean.
- **`issuer` is `https://accounts.google.com`** (with `https` and a trailing dot-free host). The legacy bare `accounts.google.com` form that Google's docs mention is *not* accepted — the library will reject a token whose `iss` doesn't match exactly.
- **`authorization_response_iss_parameter_supported: true`** forces `openid-client` to require and validate the `iss` parameter on the authorization response (RFC 9207), rather than treating it as optional.
