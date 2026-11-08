---
source: src/modules/account/oauth/deletion-redirect.ts
sha256: 487049bedea708342f7b7d9e4c4553a7855a0140480f013fe390b0186329707e
generated_at: 2026-11-08T04:12:12.498802+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/oauth/deletion-redirect.ts

## Purpose

Carries the deletion-restore claim check (minted by `buildDeletionPending`) in a cookie across the OAuth provider's redirect, rather than in the URL. This mirrors the pattern used by `./mfa-redirect.ts` for the 2FA challenge. The `POST /account/login/restore` endpoint reads this cookie when its request body omits `challenge`.

## Key elements

- **`DELETION_CHALLENGE_COOKIE`** — constant holding the cookie name, derived from `cookieData.oauthDeletionChallenge.name`.
- **`createDeletionChallengeCookie(response, challenge, expiresAt)`** — sets the cookie on the OAuth callback redirect response. `maxAge` is computed so the cookie expires at the same instant as the claim check itself.
- **`destroyDeletionChallengeCookie(response)`** — clears the cookie after the claim check has been consumed.
- **`readDeletionChallengeCookie(request)`** — reads the cookie off an incoming request; returns `string | undefined`.

## Relationships

- **`src/infrastructure/http/cookies.ts`** — imports `cookieOf`, used by `readDeletionChallengeCookie` to extract the cookie value from the request.
- **`src/modules/account/session/cookies.ts`** — imports `hostCookieOptions`, spread into the `Set-Cookie` options in both create and destroy so the cookie is host-scoped consistently with other session cookies.
- **`src/modules/account/controllers/get-oauth-callback.ts`** — expected caller of `createDeletionChallengeCookie`; the doc comment refers to "the callback's redirect response."
- **`src/modules/account/controllers/post-login-restore.ts`** — expected consumer of `readDeletionChallengeCookie` (and `destroyDeletionChallengeCookie` after the check is spent); the doc comment notes it reads the cookie "whenever its body omits `challenge`."

## Notes

- The cookie's lifetime is tied to the claim check's `expiresAt`, not a fixed window. If `expiresAt` is already in the past, `maxAge` clamps to `0` (immediate expiry).
- The cookie is intended to be set once per OAuth sign-in and cleared exactly once after the check is spent. Calling `destroyDeletionChallengeCookie` without a prior `create` is a no-op in terms of data loss but still sends a `Set-Cookie: …=; Max-Age=0`.
- The claim check value is stored **plaintext** in the cookie (not hashed), consistent with how the MFA challenge cookie is handled.
