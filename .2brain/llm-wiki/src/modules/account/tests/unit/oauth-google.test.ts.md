---
source: src/modules/account/tests/unit/oauth-google.test.ts
sha256: d047c2c27a3ca0ddc48eba4c0b714dfd861f85cee8a91d3c80cfa602b19076cc
generated_at: 2026-11-08T04:48:04.530546+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/oauth-google.test.ts

## Purpose

Unit tests for the Google OAuth provider (`googleOAuthProvider`), covering configuration detection, authorize-URL construction, and the full `exchangeCode` flow—including every security refusal the library performs before or after the token exchange. `fetch` is globally mocked so the tests exercise the library's own issuer/audience/expiry/state/PKCE checks rather than any real network I/O. Signature verification is explicitly out of scope (see the module doc-comment).

## Key elements

- **`CLIENT_ID` / `REDIRECT_URI`** – Test fixtures; the client ID doubles as the expected `aud` claim, the redirect URI is asserted verbatim in the authorize URL.
- **`callbackWith(query?)`** – Builds the callback `URL` the controller would pass to `exchangeCode`, defaulting to a Google-shaped query (`code`, `state`, `iss`).
- **`EXPECTED`** – The `state`/`codeVerifier` pair the provider must match.
- **`validClaims()`** – A baseline set of Google ID-token claims for positive/negative mutations.
- **`idToken(claims, { expiresIn })`** – Signs an RS256 JWT with a generated key pair; `expiresIn` in seconds (negative = expired).
- **`mockGoogle(tokenBody, status?)`** – Spies on `globalThis.fetch`, returning a `Response.json` shaped like Google's token endpoint.
- **`tokenResponse(idTokenValue?)`** – Wraps the `id_token` in the standard Google token-endpoint body.
- **`exchange()`** – Shorthand for `googleOAuthProvider.exchangeCode(callbackWith(), EXPECTED)`.
- **`beforeAll` / `beforeEach` / `afterEach`** – Generates the RS256 key pair, sets the two required env vars via `setEnvironment`, and restores all mocks.
- **Test groups** – `google provider configuration`, `googleOAuthProvider.authorizeUrl`, `googleOAuthProvider.exchangeCode` (the bulk: happy path, state mismatch, wrong/missing `iss` in callback, duplicate `code`, `error` param, extra params tolerance, wrong `iss`/`aud`/expiry in the token, missing `sub`, non-2xx status, missing `id_token`, no-redirect policy, 1 MiB byte-cap, abort/timeout).

## Relationships

- **`src/modules/account/oauth/config.ts`** – Imports `isOAuthProviderConfigured` to verify the two env vars gate provider availability.
- **`src/modules/account/oauth/providers/google.ts`** – Imports `googleOAuthProvider`; every test calls `authorizeUrl` or `exchangeCode` on it.
- **`tests/support/environment.ts`** – Imports `setEnvironment` to inject/override `NODE_OAUTH_GOOGLE_CLIENT_ID` and `NODE_OAUTH_GOOGLE_CLIENT_SECRET` per test.

## Notes

- Signature verification is deliberately **not** tested here; the module doc-comment points to the provider's own doc for why.
- The `iss` callback-URL check is tied to **RFC 9207** (OAuth 2.1 / draft-ietf-oauth-params-iss). Google is documented to send `iss`; a missing or non-`https://accounts.google.com` value is a hard reject.
- The byte-cap test expects the rejection message to surface in `error.cause.message`, not the top-level message.
- The abort/timeout test uses `jest.useFakeTimers()` and a `fetch` mock that only settles on the request's own `AbortSignal`, proving the deadline is wired into the actual request rather than a separate timer.
- `email_verified: false` is asserted as `emailVerified: false` (explicitly unverified), distinct from the claim being absent.
