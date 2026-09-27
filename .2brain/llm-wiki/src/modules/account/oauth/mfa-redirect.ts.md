---
source: src/modules/account/oauth/mfa-redirect.ts
sha256: 7e50592ff0c38d98b4d8f1567631ac1b4fca24def8a9325e9323ed1a72494303
generated_at: 2026-09-27T14:27:47.752848+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/oauth/mfa-redirect.ts

## Purpose

Manages the single cookie (`oauth_mfa_challenge`) that carries a login-challenge token across an OAuth provider's redirect back to the 2FA endpoints. By storing the challenge in a cookie rather than the query string, it keeps the live credential out of browser history and `Referer` headers. This is what lets password-originated logins (challenge delivered in the JSON response) and OAuth-originated logins (challenge never sent to the client) share the same two `POST /account/login/2fa` endpoints.

## Key elements

- **`MFA_CHALLENGE_COOKIE`** — constant for the cookie name (`oauth_mfa_challenge`). Single-attempt; cleared once the challenge is spent.
- **`createMfaChallengeCookie(response, challenge, expiresAt)`** — sets the cookie on the callback's redirect response. Derives `maxAge` from the challenge's own `expiresAt` (ISO 8601) rather than a fixed duration, because a delivered-method challenge outlives a device one. Spreads `secureCookieOptions()` into the cookie options.
- **`destroyMfaChallengeCookie(response)`** — clears the cookie (called after the challenge is consumed, success or failure).
- **`readMfaChallengeCookie(request)`** — reads the cookie off an incoming request via `cookieOf`, returning `string | undefined`.

## Relationships

- **`src/kernel/cookies.ts`** — provides `cookieOf`, used by `readMfaChallengeCookie` to extract the cookie from the request.
- **`src/modules/account/session/cookies.ts`** — provides `secureCookieOptions`, spread into the options object in both `createMfaChallengeCookie` and `destroyMfaChallengeCookie`.
- **`src/modules/account/controllers/get-oauth-callback.ts`** — the caller that sets the challenge cookie on the redirect response (the "set" side of this module's lifecycle).
- **`src/modules/account/controllers/post-login-2fa.ts`** and **`post-login-2fa-send.ts`** — the callers that read the cookie (via `readMfaChallengeCookie`) whenever the request body omits a `challenge` field, then destroy it once the challenge is spent.

## Notes

- The `maxAge` is computed as `expiresAt − now` clamped to ≥ 0; if the challenge has already expired the cookie is set with zero lifetime (effectively a no-op).
- The module is a `@module` (no runtime side effects on import); all exports are pure functions/constants.
- The design rationale is documented in `docs/theory/defences/authentication.md#federated-login` — the challenge is treated as a live credential that must never appear in a URL.
