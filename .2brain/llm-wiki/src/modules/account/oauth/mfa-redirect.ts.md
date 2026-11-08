---
source: src/modules/account/oauth/mfa-redirect.ts
sha256: e8436232ab412ace71079c6adb9714ba500c8c9ae6190ebf713674e69e07a1fc
generated_at: 2026-11-08T04:12:23.941012+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/oauth/mfa-redirect.ts

## Purpose

Manages the single cookie (`oauthMfaChallenge`) that carries an MFA login challenge token across an OAuth provider's redirect round-trip. It exists so the challenge never appears in the URL (where it would leak via browser history and `Referer` headers), and so the two 2FA endpoints can serve both password-originated and OAuth-originated logins from the same code path.

## Key elements

- **`createMfaChallengeCookie(response, challenge, expiresAt)`** — Sets the challenge cookie on the outgoing redirect response. Derives `maxAge` from the challenge's own `expiresAt` (ISO 8601) rather than using a fixed TTL, so the cookie lifetime matches the challenge's (delivered-method vs. device) expiry automatically.
- **`destroyMfaChallengeCookie(response)`** — Clears the cookie once the challenge has been consumed (success or failure path).
- **`readMfaChallengeCookie(request)`** — Returns the challenge string from the incoming request's cookie, or `undefined` if absent.
- **`MFA_CHALLENGE_COOKIE`** (internal constant) — Resolves the canonical cookie name from the generated `cookieData.oauthMfaChallenge` registry.

## Relationships

- **`src/infrastructure/http/cookies.ts`** — Source of `cookieOf` (generic request-cookie reader used by `readMfaChallengeCookie`) and the generated `cookieData` registry that supplies the canonical cookie name.
- **`src/modules/account/session/cookies.ts`** — Provides `hostCookieOptions()` (domain/secure/sameSite flags) spread into both `createMfaChallengeCookie` and `destroyMfaChallengeCookie` so the cookie inherits the same security attributes as other session cookies.
- **`src/modules/account/controllers/get-oauth-callback.ts`** — Expected caller of `createMfaChallengeCookie` at the moment it issues the redirect back from the OAuth provider, attaching the challenge before the browser lands on the 2FA screen.
- **`src/modules/account/controllers/post-login-2fa.ts`** / **`post-login-2fa-send.ts`** — Expected callers of `readMfaChallengeCookie` (to supply the challenge when the request body omits one) and `destroyMfaChallengeCookie` (to clear it after the single-attempt window closes).

## Notes

- The cookie is **single-attempt by design**: the consuming controller is responsible for calling `destroyMfaChallengeCookie` after it has validated (or rejected) the challenge. Forgetting to do so leaves a live credential in the cookie until `maxAge` expires.
- `maxAge` is computed as `expiresAt − now` floored at `0`, so a stale `expiresAt` silently produces a zero-lifetime (immediately expired) cookie rather than a negative one.
- The challenge is stored in **plaintext** in the cookie value; the file relies on `hostCookieOptions()` (presumably `Secure` + `HttpOnly`) for transport protection. There is no additional encoding or signing here.
