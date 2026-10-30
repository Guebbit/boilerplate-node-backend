---
source: src/modules/account/oauth/deletion-redirect.ts
sha256: f376345e5f2c76941573787f3c5ff24c9af6cf0d1548d00764e8f575310e1ad5
generated_at: 2026-10-29T02:36:40.478348+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/oauth/deletion-redirect.ts

## Purpose

Manages the single `__Host-oauth_deletion_challenge` cookie that carries a deletion-grace claim check (minted by `buildDeletionPending`) across an OAuth provider redirect. The claim check travels in a cookie rather than a URL parameter, mirroring the pattern used by `mfa-redirect.ts` for 2FA challenges. `POST /account/login/restore` falls back to this cookie when its request body omits `challenge`.

## Key elements

- **`DELETION_CHALLENGE_COOKIE`** (module-private) – The cookie name constant: `__Host-oauth_deletion_challenge`.
- **`createDeletionChallengeCookie(response, challenge, expiresAt)`** – Sets the cookie on the OAuth callback's redirect `Response`. Computes `maxAge` from the `expiresAt` ISO 8601 string so the cookie lifetime matches the claim check's own expiry.
- **`destroyDeletionChallengeCookie(response)`** – Clears the cookie on the `Response` once the check has been spent.
- **`readDeletionChallengeCookie(request)`** – Reads the cookie value off an incoming `Request`; returns `undefined` if absent.

## Relationships

- **`src/infrastructure/http/cookies.ts`** – Supplies `cookieOf`, the utility used by `readDeletionChallengeCookie` to extract the cookie from the request.
- **`src/modules/account/session/cookies.ts`** – Supplies `hostCookieOptions`, spread into both set and clear calls so the cookie inherits the standard secure/`SameSite`/`Path` attributes.
- **`src/modules/account/controllers/get-oauth-callback.ts`** – The OAuth callback controller that calls `createDeletionChallengeCookie` on its redirect `Response` before the browser leaves for the provider.
- **`src/modules/account/controllers/post-login-restore.ts`** – The restore controller that calls `readDeletionChallengeCookie` as a fallback source for `challenge` and `destroyDeletionChallengeCookie` after the check is consumed.

## Notes

- The cookie is **single-use**: `destroyDeletionChallengeCookie` must be called exactly once the claim check is spent; a second read will return `undefined`.
- `maxAge` is floored at `0` (`Math.max(0, …)`), so an already-expired `expiresAt` produces an immediately-expired cookie rather than a negative duration.
- The `__Host-` prefix is part of the cookie name itself (not just an option), which enforces `Secure` and `Path=/` at the browser level in addition to the `hostCookieOptions` settings.
