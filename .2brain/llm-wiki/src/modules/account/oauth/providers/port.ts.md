---
source: src/modules/account/oauth/providers/port.ts
source_sha256: 5398ad4cd954ba56b04abe5196eb7a54b39ab075c78d850b7320cd43ae4c5ec7
context_sha256: 99298bc86e683b2cadd62ed76a64749f34fe23c3e482de93d8963166016a71f5
generated_at: 2026-11-22T03:32:53.287622+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/oauth/providers/port.ts

## Purpose
Defines the OAuth provider port: the interface a real identity provider (Google, GitHub, etc.) implements to plug into the app. It mirrors the shape of `PaymentProvider` in `src/modules/payments/providers/index.ts`. Unlike payments, several providers can be enabled at once, so selection happens in `./index`'s registry rather than through a single `NODE_*_PROVIDER` switch.

## Key elements
- `OAuthIdentity`: the result of a successful token exchange.
  - `providerId`: the provider's stable `sub`. It is the identity key that `src/modules/account/services/oauth.ts` stores, not `email`.
  - `email`: the address the provider claims for the identity.
  - `emailVerified`: the provider's own claim that `email` is verified.
  - `name?` and `imageUrl?`: optional display name and avatar URL.
- `OAuthExpectation`: what the login attempt kept at the start and the callback must answer to.
  - `state`: the CSRF token for this attempt.
  - `codeVerifier`: the PKCE secret behind the challenge that `authorizeUrl` sent.
- `OAuthProvider`: the provider contract.
  - `name`: persisted on `OAuthAccount.provider` and returned by `enabledProviders()`.
  - `authorizeUrl(state, redirectUri, codeChallenge)`: returns the consent URL. It sends `code_challenge` with `code_challenge_method=S256` (RFC 7636).
  - `exchangeCode(callbackUrl, expected)`: exchanges the authorization code for an `OAuthIdentity`. It throws on a `state` mismatch, a malformed response (repeated or foreign parameter, foreign `iss`), a failed exchange, or an unparseable provider answer.

## Relationships
- `src/modules/account/oauth/providers/github.ts` and `src/modules/account/oauth/providers/google.ts` are the concrete implementations of `OAuthProvider`.
- `src/modules/account/oauth/providers/index.ts` holds the registry that selects among enabled providers and exposes `enabledProviders()`.
- `src/modules/account/oauth/providers/client.ts` sits in the same provider layer as a neighbor in the dependency graph.
- `src/modules/account/services/oauth.ts` consumes `OAuthIdentity`. It keys accounts on `providerId` and refuses to link an unverified email to an existing password account.
- `scenarios/support/doubles/oauth-fake.ts` is a test double for this port.
- `src/modules/account/tests/integration/oauth-link.test.ts` exercises the linking flow through the port.

## Notes
- `redirectUri` passed to `authorizeUrl` is always server-derived (`src/app/config.ts`), never taken from the request.
- The `state` and `codeChallenge` come from `src/modules/account/oauth/state.ts`. `codeChallenge` is `codeChallengeOf` applied to the PKCE verifier.
- `callbackUrl` in `exchangeCode` must carry the real query string the provider's redirect arrived with (`code`, `state`, and `iss` when sent), not a rebuilt one. The library validates the whole response, and its redirect URI is this URL without the query. The URL is on the `NODE_URL` base.
