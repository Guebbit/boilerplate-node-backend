---
source: src/modules/account/tests/unit/oauth-google.test.ts
sha256: cc20fc565e6b9569711bf9d10b42654802721ad92671f12013fc31651cefa093
generated_at: 2026-11-14T19:15:41.319251+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/oauth-google.test.ts

## Purpose

Unit tests for the Google OAuth provider (`googleOAuthProvider`). They verify that the authorize URL is built correctly, that `exchangeCode` validates the callback query (state, issuer, duplicate params, errors) before making any network call, that the token-endpoint response is validated (issuer, audience, expiry, subject, `email_verified`), and that transport-level safeguards (redirect policy, byte cap, abort-on-timeout) are enforced. `fetch` is fully mocked; no real network or signature verification occurs.

## Key elements

- **`validClaims()`** — returns the default set of claims for a "good" Google ID token; each rejection test overrides one field.
- **`idToken(claims, { expiresIn })`** — signs an RS256 JWT via `jose` using the `signing` key pair generated in `beforeAll`.
- **`mockGoogle(tokenBody, tokenStatus)`** — replaces `globalThis.fetch` with a spy that resolves to `Response.json(tokenBody, { status })`; the spy is inspectable in assertions.
- **`tokenResponse(idTokenValue)`** — shapes the token-endpoint body (access_token, token_type, optional id_token).
- **`callbackWith(query)`** — builds the full callback URL from a raw query string, mimicking what Google would redirect back with.
- **`exchange()`** — shorthand for `googleOAuthProvider.exchangeCode(callbackWith(), EXPECTED)`.
- **`describe('google provider configuration')`** — asserts `isOAuthProviderConfigured('google')` true/false based on env vars.
- **`describe('googleOAuthProvider.authorizeUrl')`** — asserts the consent-screen URL, its origin, and every query parameter (client_id, redirect_uri, response_type, state, scope, code_challenge, code_challenge_method).
- **`describe('googleOAuthProvider.exchangeCode')`** — the bulk of the suite: happy-path identity extraction, request-body verification, and rejection cases for bad state, wrong/missing issuer, repeated `code`, `error` param, wrong aud, wrong iss, expired token, missing id_token, non-2xx status, missing `sub`, redirect-following, oversized response, and timeout/abort.

## Relationships

- **`src/modules/account/oauth/providers/google.ts`** — the system under test; provides `googleOAuthProvider` whose `authorizeUrl` and `exchangeCode` methods are exercised here.
- **`src/modules/account/oauth/config.ts`** — provides `isOAuthProviderConfigured('google')`, tested in the configuration block.
- **`tests/support/environment.ts`** — provides `setEnvironment`, used in `beforeEach` to inject `NODE_OAUTH_GOOGLE_CLIENT_ID` / `_SECRET` and in individual tests to unset one.

## Notes

- **Signature is deliberately not verified.** The module doc comment states the signature is out of scope here and points to the provider module's own doc for the reason. The `jose` key pair only guarantees the JWT is *well-formed* RS256 so that other claims can be isolated.
- **`fetch` mock resets via `jest.restoreAllMocks()` in `afterEach`.** Tests that need a one-shot mock (byte-cap, timeout) use `mockResolvedValueOnce` or a custom `mockImplementation` instead of the shared `mockGoogle` helper.
- **The byte-cap test** (1 MiB + 1 byte) asserts the rejection's `cause.message` matches `/longer than/`, because the library wraps the underlying error.
- **The timeout test** uses `jest.useFakeTimers()` and a `fetch` mock that only settles when the request's `AbortSignal` fires, proving the deadline is actually wired to the request rather than just existing as a timer.
- **`email_verified: false`** is a *pass* case (resolves with `emailVerified: false`), distinct from the missing-`sub` rejection.
