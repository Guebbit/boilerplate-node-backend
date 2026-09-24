---
source: src/modules/account/oauth/mfa-redirect.ts
sha256: f4b7cf35cfd065874f94837b50cca925fa8bc2a75f591b11ff1bb200ef9be67a
generated_at: 2026-09-23T18:06:09.730784+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/oauth/mfa-redirect.ts

## Purpose

Manages the single HTTP cookie (`oauth_mfa_challenge`) that carries the MFA login challenge across an OAuth provider redirect. By keeping the challenge in a cookie instead of the URL query string, it avoids leaking a live credential into browser history and `Referer` headers. This lets OAuth-originated 2FA logins share the same `POST /account/login/2fa` and `/2fa/send` endpoints as password-originated logins (where the challenge arrives in the JSON response body).

## Key elements

- **`MFA_CHALLENGE_COOKIE`** – Exported constant; the cookie name (`'oauth_mfa_challenge'`).
- **`mfaChallengeCookieOptions()`** – Private helper returning `{ httpOnly, secure, sameSite: 'lax', path: '/' }`. A function (not a constant) so `NODE_ENV` is evaluated at call time.
- **`createMfaChallengeCookie(response, challenge, expiresAt)`** – Sets the cookie on the redirect response with `maxAge` derived from the challenge's own `expiresAt` (not a fixed value).
- **`destroyMfaChallengeCookie(response)`** – Clears the cookie after it has been consumed (success or failure).
- **`readMfaChallengeCookie(request)`** – Reads the challenge value from the incoming request's cookie, or returns `undefined`.

## Relationships

- **`src/modules/account/controllers/get-oauth-callback.ts`** – Calls `createMfaChallengeCookie` to stamp the challenge onto the redirect response before sending the user to the provider.
- **`src/modules/account/controllers/post-login-2fa-send.ts`** – Calls `readMfaChallengeCookie` when the request body omits `challenge`; calls `destroyMfaChallengeCookie` once the challenge is spent.
- **`src/modules/account/controllers/post-login-2fa.ts`** – Same read/destroy pattern as above for the verification endpoint.

## Notes

- The cookie is **single-attempt**: callers must clear it after the first successful or failed verification, regardless of outcome.
- `maxAge` is computed as `expiresAt − Date.now()`, floored at 0. This tracks the challenge's own lifetime, which differs between delivered-method and device challenges.
- The `secure` flag is gated on `NODE_ENV === 'production'` at call time, matching the convention in `oauth/state.ts` cookies.
- In the OAuth flow the challenge token is **never** included in the JSON response to the client; the cookie is the sole transport.
