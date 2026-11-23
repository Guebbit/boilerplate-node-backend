---
source: src/modules/account/oauth/deletion-redirect.ts
source_sha256: 487049bedea708342f7b7d9e4c4553a7855a0140480f013fe390b0186329707e
context_sha256: c6d93c2cb1a013822936d4fb0b70739d3237fae9470adbdd05659cb945e3b6fd
generated_at: 2026-11-22T03:31:41.528051+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/oauth/deletion-redirect.ts

## Purpose
Manages the single cookie used by the OAuth deletion-grace continuation. The cookie carries the claim check minted by `buildDeletionPending` across the OAuth provider's redirect, so the token is not placed in the URL. This is the same reason `./mfa-redirect.ts` carries the 2FA challenge this way. `POST /account/login/restore` reads the cookie when its body omits `challenge`.

## Key elements
- `createDeletionChallengeCookie(response, challenge, expiresAt)` sets the claim-check cookie on the callback's redirect response. It sets `maxAge` to the time remaining until `expiresAt` (ISO 8601), floored at 0, so the cookie lifetime tracks the check's expiry. It spreads `hostCookieOptions()` into the options.
- `destroyDeletionChallengeCookie(response)` clears the cookie, using the same `hostCookieOptions()`. It is called once the check has been spent.
- `readDeletionChallengeCookie(request)` returns the cookie value from an incoming request, or `undefined` if none was set.
- `DELETION_CHALLENGE_COOKIE` (module-private) is the cookie name, taken from `cookieData.oauthDeletionChallenge.name`.

## Relationships
- `src/infrastructure/http/cookies.ts`: supplies `cookieOf`, which the read helper uses.
- `src/modules/account/session/cookies.ts`: supplies `hostCookieOptions`, which sets the cookie attributes on both set and clear.
- `src/modules/account/controllers/get-oauth-callback.ts`: the callback that sets this cookie on its redirect response. This is inferred from the doc comment and parameter descriptions, not shown in this file.
- `src/modules/account/controllers/post-login-restore.ts`: the restore endpoint that reads the cookie when `challenge` is missing from its body, per the module doc.

## Notes
- The cookie is cleared with the same options it was set with. Express's `clearCookie` generally needs matching options (apart from `maxAge`) to remove a cookie.
- A past `expiresAt` produces `maxAge` of 0, not a negative value.
