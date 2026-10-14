---
source: src/modules/account/oauth/mfa-redirect.ts
sha256: 32a56c8e2e839aa7a2c9d263ef9b65e6dd32e726008ea2ff0b3a075289f82a02
generated_at: 2026-10-14T08:42:53.389787+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/oauth/mfa-redirect.ts

## Purpose

Manages a single HTTP cookie (`oauth_mfa_challenge`) that carries an MFA login-challenge token across an OAuth provider redirect. Because placing the challenge in the query string would expose it in browser history and `Referer` headers, it is transmitted as a cookie instead. This lets the two `POST /account/login/2fa*` endpoints serve both password-originated logins (challenge in the JSON body) and OAuth-originated logins (challenge in the cookie) through the same code path.

## Key elements

- **`MFA_CHALLENGE_COOKIE`** — the cookie name constant (`'oauth_mfa_challenge'`); single-attempt, cleared after the challenge is consumed.
- **`createMfaChallengeCookie(response, challenge, expiresAt)`** — Sets the cookie on the OAuth redirect response. Computes `maxAge` from the challenge's own `expiresAt` (not a fixed TTL), because a delivered-method challenge lives twice as long as a device challenge. Spreads `secureCookieOptions()` for transport security.
- **`destroyMfaChallengeCookie(response)`** — Clears the cookie; called once the challenge has been spent (success *or* failure).
- **`readMfaChallengeCookie(request)`** — Returns the challenge string from the incoming request, or `undefined` if the cookie is absent.

## Relationships

- **`src/infrastructure/http/cookies.ts`** — provides `cookieOf`, the low-level cookie reader used by `readMfaChallengeCookie`.
- **`src/modules/account/session/cookies.ts`** — provides `secureCookieOptions`, which supplies the `httpOnly`/`secure`/`sameSite` flags applied when setting and clearing the cookie.
- **`src/modules/account/controllers/get-oauth-callback.ts`** — the OAuth callback that calls `createMfaChallengeCookie` on the redirect `Response` before sending the user to the provider.
- **`src/modules/account/controllers/post-login-2fa.ts`** and **`post-login-2fa-send.ts`** — call `readMfaChallengeCookie` when the request body omits `challenge`, falling back to the cookie for OAuth-originated logins.

## Notes

- The cookie is **single-attempt by design**: the consuming endpoint must call `destroyMfaChallengeCookie` regardless of whether validation succeeds. Forgetting to clear it would allow replay.
- `maxAge` is computed as `expiresAt − now` and clamped to ≥ 0, so a stale or already-expired challenge produces a zero-lifetime cookie rather than a negative one.
- The challenge value is stored in **plaintext** in the cookie (not hashed). Security relies on the `secure`/`httpOnly`/`sameSite` flags from `secureCookieOptions` and the short, challenge-specific lifetime.
