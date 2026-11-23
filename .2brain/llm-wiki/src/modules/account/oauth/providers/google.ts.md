---
source: src/modules/account/oauth/providers/google.ts
source_sha256: d23aae68ee37058cf32d6c1274ea59b7789176588b3389d543063666ff859abe
context_sha256: 571b70e85d64e62af6240103c49efee908a9f3908f4a13bb703df1849dc5a25a
generated_at: 2026-11-22T03:32:27.235373+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/oauth/providers/google.ts

## Purpose
Implements the Google provider behind the OAuth port. It builds Google's authorization URL and, on callback, exchanges the code for tokens and reads the user's identity from the ID token's claims. There is no separate `userinfo` request.

## Key elements
- `googleOAuthProvider` (exported): an `OAuthProvider` with `name: 'google'`.
  - `authorizeUrl(state, redirectUri, codeChallenge)`: builds the authorization URL with scope `openid email profile`.
  - `exchangeCode(callbackUrl, expected)`: redeems the code and maps the ID token claims to an `OAuthIdentity`.
- `SERVER`: Google's endpoints (issuer, authorization endpoint, token endpoint) hard-coded as `client.ServerMetadata` instead of discovered. It sets `authorization_response_iss_parameter_supported: true`.
- `identityOf(claims)`: converts verified claims into an `OAuthIdentity`.
  - `providerId` is `sub`.
  - `emailVerified` is true for `true` or `'true'`.
  - `name` and `imageUrl` are optional.
  - It throws `Error` if there is no `id_token`, and `TypeError` if `sub` or `email` is missing.
- `PROVIDER_NAME` (`'google'`): the registry key, which is also what ends up in `OAuthAccount.provider`.

## Relationships
- `src/modules/account/oauth/providers/client.ts`: supplies `configurationFor`, `authorizationUrlFor` and `redeemCode`. These do the actual `openid-client` work. This file only supplies Google's metadata, scope and claim mapping.
- `src/modules/account/oauth/providers/port.ts`: defines the `OAuthProvider` and `OAuthIdentity` types that this file implements and returns.
- `src/modules/account/oauth/providers/index.ts`: a sibling in the providers module. It is a graph neighbor, but this file does not import it.
- `src/modules/account/tests/unit/oauth-google.test.ts`: the unit test for this provider.

## Notes
- The ID token's signature is deliberately not verified. The token comes directly from Google's token endpoint over TLS, which OIDC Core 3.1.3.7 step 6 accepts in place of a signature check. The library does check issuer, audience, expiry and issue time.
- The issuer must equal `https://accounts.google.com` exactly. The legacy bare `accounts.google.com` form is rejected.
- Because `authorization_response_iss_parameter_supported` is true, the library requires an `iss` parameter on the callback and compares it to the issuer (RFC 9207).
- `identityOf` requires a non-empty `sub`. Without one, every account would share a single identity row.
