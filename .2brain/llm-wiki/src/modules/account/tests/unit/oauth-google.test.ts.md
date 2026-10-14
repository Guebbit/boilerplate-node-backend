---
source: src/modules/account/tests/unit/oauth-google.test.ts
sha256: d047c2c27a3ca0ddc48eba4c0b714dfd861f85cee8a91d3c80cfa602b19076cc
generated_at: 2026-10-14T09:21:39.087808+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/oauth-google.test.ts

## Purpose

Unit tests for the Google OAuth provider (`googleOAuthProvider`). They verify that `authorizeUrl` builds a correct consent-screen URL, and that `exchangeCode` correctly validates the callback (state, issuer, PKCE) and the returned ID token (audience, issuer, expiry, subject) before resolving an identity. `fetch` is mocked throughout so the tests exercise the library's own claim checks without any network I/O.

## Key elements

- **`callbackWith(query)`** – builds the full callback URL (redirect URI + raw query string) used as the `exchangeCode` input.
- **`EXPECTED`** – the `{ state, codeVerifier }` pair the test attempt starts with.
- **`validClaims()`** – a baseline set of Google ID-token claims (iss, aud, sub, email, etc.) that individual tests override one field at a time.
- **`idToken(claims, { expiresIn })`** – signs an RS256 JWT with the given claims and a controllable expiry; used to fabricate valid/expired/malformed tokens.
- **`mockGoogle(tokenBody, tokenStatus)`** – spies on `globalThis.fetch` to return a canned token-endpoint response; the spy is inspectable for request-assertion.
- **`tokenResponse(idTokenValue)`** – shapes a Google-style token body (`access_token`, `token_type`, optional `id_token`).
- **`exchange()`** – shorthand for `googleOAuthProvider.exchangeCode(callbackWith(), EXPECTED)` to keep test bodies short.
- **Test suites:**
  - *google provider configuration* – `isOAuthProviderConfigured('google')` toggles with env vars.
  - *googleOAuthProvider.authorizeUrl* – asserts every query parameter on the consent URL.
  - *googleOAuthProvider.exchangeCode* – happy path, request-body shape, and a battery of rejection cases (forged state, wrong/missing `iss`, repeated `code`, `error` param, wrong audience, wrong issuer, expired token, missing `sub`, non-2xx, missing `id_token`, oversized response, hung response via abort).

## Relationships

- **`src/modules/account/oauth/config.ts`** – imports `isOAuthProviderConfigured` to confirm the provider reports configured/unconfigured based on the two `NODE_OAUTH_GOOGLE_*` env vars.
- **`src/modules/account/oauth/providers/google.ts`** – the system under test; calls `googleOAuthProvider.authorizeUrl` and `googleOAuthProvider.exchangeCode`.
- **`tests/support/environment.ts`** – imports `setEnvironment` to set or clear the Google client-id/secret env vars in `beforeEach` / individual tests.

## Notes

- **Signature is not verified by the library.** The test file's module doc explicitly states the RS256 signature is *not* one of the checks under test; the `jose` key pair is generated only to produce well-formed tokens so the claim checks can run. Don't read the signing setup as an assertion on signature verification.
- **`iss` in the callback query is tested per RFC 9207** (OAuth 2.0 Security BCP). The provider expects it to be present (Google sends it) and rejects mismatched or missing values before any network call.
- **Redirects from the token endpoint are forbidden** — every `fetch` call is asserted to carry `redirect: 'error'`.
- **Byte cap:** a response larger than 1 MiB must be rejected with a message in `cause.message` matching `/longer than/`, not buffered.
- **Abort test** uses `jest.useFakeTimers()` and a custom `fetch` mock that only rejects when the request's own `AbortSignal` fires, proving the deadline is wired into the actual request rather than just existing as a timer.
- **`afterEach` restores all mocks** via `jest.restoreAllMocks()`; each test that needs a custom `fetch` behavior must re-spy after that reset.
