---
source: src/modules/account/oauth/mfa-redirect.ts
source_sha256: 2ca2cdb9c632c51add987775ee1c6c42e43b7c7b8a3b496cc1a6490f994fa1c5
context_sha256: 445a35c256b02030c577a6c27e83110f2815e34b37f06378b25755d960c1bd34
generated_at: 2026-11-22T03:31:53.377320+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/oauth/mfa-redirect.ts

## Purpose
Manages the single cookie that carries the OAuth 2FA login challenge across the provider's redirect. The challenge minted by `buildLoginChallenge` is kept out of the URL, since a live credential in the query string would end up in browser history and `Referer` headers. The cookie lets password-originated and OAuth-originated logins share the same two 2FA endpoints: when a request body omits `challenge`, the endpoints read it from this cookie.

## Key elements
- `createMfaChallengeCookie(response, challenge, expiresAt)` sets the challenge cookie on the callback's redirect response. `maxAge` is `max(0, expiresAt - now)`, so the cookie lives exactly as long as the challenge. This matters because a delivered method's challenge lives twice as long as a device one's. It spreads in `hostCookieOptions()`.
- `destroyMfaChallengeCookie(response)` clears the cookie with the same `hostCookieOptions()`. It is called once the challenge is spent, on success or failure.
- `readMfaChallengeCookie(request)` returns the cookie value, or `undefined` if none was set. It uses `cookieOf`.
- `MFA_CHALLENGE_COOKIE` (module-private) is the cookie name, taken from `cookieData.oauthMfaChallenge.name` in the generated cookie data.

## Relationships
- `../session/cookies` (`src/modules/account/session/cookies.ts`) supplies `hostCookieOptions()`, the shared cookie attributes used for both setting and clearing.
- `src/infrastructure/http/cookies.ts` supplies `cookieOf`, used to read the cookie from a request.
- `get-oauth-callback.ts` is the OAuth callback that issues the challenge. Per the doc comments, it is the "callback's redirect response" that receives the cookie.
- `post-login-2fa.ts` and `post-login-2fa-send.ts` are the `POST /account/login/2fa` and `.../2fa/send` endpoints. They read the cookie whenever their body omits `challenge`.

## Notes
- The cookie is single-attempt and should be cleared once the challenge is spent.
- An OAuth-originated login never sends the challenge to the client in a response body. The cookie is the only carrier.
- The file's `@see` points to the federated-login section of the authentication defences documentation (`src/kernel/authentication.ts`).
