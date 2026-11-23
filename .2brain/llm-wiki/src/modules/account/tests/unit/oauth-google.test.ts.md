---
source: src/modules/account/tests/unit/oauth-google.test.ts
source_sha256: 133339402e268adb97f00a2e21d6f0b8fa74afaa98220be2959b0a7a4ec38205
context_sha256: 9e4b8cca96a7d6ef5942f12931525da145bd54208b9d62649890bfacc667821e
generated_at: 2026-11-22T04:06:55.450764+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/unit/oauth-google.test.ts

## Purpose
Unit tests for the Google OAuth provider (`src/modules/account/oauth/providers/google.ts`): the authorize URL it builds, and what it accepts or refuses after a token exchange. `fetch` is mocked to answer the token endpoint with an RS256-shaped ID token, so the cases exercise the library's own checks (issuer, audience, expiry, state). The module doc notes that signature verification is deliberately not among them.

## Key elements
- **Constants and helpers**
  - `CLIENT_ID` is also the required `aud` claim.
  - `REDIRECT_URI` is asserted verbatim.
  - `EXPECTED` is the attempt's stored `{ state, codeVerifier }`.
  - `callbackWith(query)` builds the callback URL. Its default query carries `code`, `state` and `iss=https://accounts.google.com`.
  - `validClaims()` returns a valid claim set to override one field at a time.
  - `idToken(claims, { expiresIn })` signs an RS256 JWT with `jose`. A negative `expiresIn` gives an expired token.
  - `mockGoogle(body, status)` spies on `globalThis.fetch` and returns the body as a `Response`.
  - `tokenResponse(idToken)` builds a Google-shaped token body.
  - `exchange()` runs one standard redemption.
- **Setup**
  - `beforeAll` generates the RS256 key pair.
  - `beforeEach` sets the client id and secret env vars through `setEnvironment`.
  - `afterEach` calls `jest.restoreAllMocks()`.
- **`google provider configuration`**: `isOAuthProviderConfigured('google')` is true with both env vars set, and false when the secret is missing.
- **`googleOAuthProvider.authorizeUrl`**: checks the consent-screen URL and its params: `client_id`, `redirect_uri`, `response_type=code`, `state`, `scope=openid email profile`, `code_challenge`, and `code_challenge_method=S256`.
- **`googleOAuthProvider.exchangeCode`**
  - Happy path: resolves `{ providerId, email, emailVerified, name, imageUrl }` from the claims.
  - Token request: it posts to `https://oauth2.googleapis.com/token` with `grant_type`, `code`, `code_verifier`, `redirect_uri`, `client_id` and `client_secret`.
  - Refused before any fetch: wrong `state`, wrong `iss` (RFC 9207), missing `iss`, a repeated `code`, and an `error` callback.
  - Extra query params Google adds (`scope`, `authuser`, `prompt`) are tolerated.
  - Rejected ID tokens: bare `accounts.google.com` issuer, wrong audience, unknown issuer, expired, missing `id_token`, missing `sub`.
  - Rejected responses: a non-2xx token response.
  - `email_verified: false` resolves as `emailVerified: false`.
  - The request uses `redirect: 'error'`, and fetch is called once.
  - A response over 1,048,576 bytes is refused. The "longer than" message is in `cause.message`.
  - A hung-Google case uses fake timers and a `fetch` that settles only when the request's own `AbortSignal` fires, to prove the deadline reaches the request. The visible content cuts off partway through this case.

## Relationships
- `src/modules/account/oauth/config.ts`: `isOAuthProviderConfigured` is tested for the `google` provider.
- `src/modules/account/oauth/providers/google.ts`: the provider under test. This file exercises its exported `googleOAuthProvider` (the `authorizeUrl` and `exchangeCode` methods).
- `tests/support/environment.ts`: imported as `@tests/environment`; `setEnvironment` sets and unsets the `NODE_OAUTH_GOOGLE_CLIENT_ID` and `NODE_OAUTH_GOOGLE_CLIENT_SECRET` env vars.

## Notes
- Most failure cases assert only `rejects.toThrow()`, with no specific error type. The exceptions are the byte-cap test (checks `cause.message`) and the `redirect: 'error'` test.
- The "refused before any request" cases assert `fetch` was never called, so validation of the callback is expected to happen before the token exchange.
- The repeated-`code` case works only because the test builds the callback from the raw query string.
- Tokens are well-formed RS256 but are not checked against any real Google key.
