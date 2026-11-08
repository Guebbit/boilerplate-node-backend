---
source: src/modules/account/oauth/providers/google.ts
sha256: d3ff5ffbfe53f3d350ece1b9bff1a36ca5fb2c7cea9f56eb8157b868e75bc207
generated_at: 2026-11-08T04:12:56.851059+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/oauth/providers/google.ts

## Purpose

Concrete `OAuthProvider` implementation for Google's OAuth 2.0 / OIDC flow, built on `openid-client`. It hard-codes Google's endpoints (no runtime discovery), enforces the `iss` callback parameter via RFC 9207, and extracts the user's identity directly from the verified ID token's claims—eliminating a separate `userinfo` round trip.

## Key elements

- **`googleOAuthProvider`** (exported) — The single public export; an `OAuthProvider` object with `name: 'google'`, `authorizeUrl`, and `exchangeCode` conforming to the `./port` contract.
- **`SERVER`** — Hard-coded `client.ServerMetadata` (issuer, authorization/token endpoints) that is passed to `openid-client` helpers on every call. Not fetched from a discovery URL.
- **`identityOf(claims)`** (private) — Validates that the ID token's claims carry a non-empty `sub` and an `email`, then maps them into the `OAuthIdentity` shape. Throws descriptive errors if either is missing.
- **`PROVIDER_NAME`** — The string `'google'`; used as the registry key and stored on `OAuthAccount.provider`.

## Relationships

- **`./port`** — Imports the `OAuthProvider` and `OAuthIdentity` types that this file implements/returns.
- **`./client`** — Imports `authorizationUrlFor`, `configurationFor`, and `redeemCode`; all `openid-client` interactions are delegated to these helpers so this file stays free of `openid-client` runtime calls (only its `type *` import).
- **`./index`** — Presumed re-export barrel that surfaces `googleOAuthProvider` to the rest of the account module.
- **`tests/unit/oauth-google.test.ts`** — Unit tests exercising this provider's `authorizeUrl` and `exchangeCode` paths.

## Notes

- **Signature is intentionally unchecked.** The comment cites OpenID Connect Core §3.1.3.7 step 6: because the ID token arrives over TLS directly from Google's token endpoint, the same trust boundary that protects the auth code and access token suffices. Do not "fix" this by adding manual signature verification without understanding the rationale.
- **`issuer` must be exactly `https://accounts.google.com`.** `openid-client` will reject the legacy bare-domain form Google's docs mention. Do not change the string.
- **`authorization_response_iss_parameter_supported: true`** is load-bearing: it makes the library require and compare the `iss` query parameter on the callback (RFC 9207). Removing it silently downgrades the anti-forgery guarantee.
- **`email_verified` is coerced** from `boolean | 'true'` to a plain `boolean` via the `=== true || === 'true'` check—Google's token occasionally returns the string form.
- The scopes are fixed to `openid email profile`; adding `contact` or `openid profile` without `email` would break `identityOf`.
