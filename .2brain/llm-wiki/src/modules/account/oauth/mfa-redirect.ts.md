---
source: src/modules/account/oauth/mfa-redirect.ts
sha256: 9f47967659640969064e352d36990b0efa524f1c18eef5e2481ed588f748c7e9
generated_at: 2026-10-29T02:36:51.316171+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/oauth/mfa-redirect.ts

## Purpose

Provides a single-purpose cookie (`__Host-oauth_mfa_challenge`) for carrying the `buildLoginChallenge` token across an OAuth provider redirect. The cookie exists so the challenge is never exposed in a URL query string (where it would persist in browser history and `Referer` headers) while still letting `POST /account/login/2fa` and `POST /account/login/2fa/send` serve both password-originated and OAuth-originated logins through the same endpoints.

## Key elements

- **`MFA_CHALLENGE_COOKIE`** (private constant) — the cookie name: `__Host-oauth_mfa_challenge`. The `__Host-` prefix enforces `Secure`, `Path=/`, and no `Domain`.
- **`createMfaChallengeCookie(response, challenge, expiresAt)`** — sets the cookie on the provider-redirect response. `maxAge` is derived from the challenge's own `expiresAt` (delivered-method challenges outlive device ones), not a fixed TTL.
- **`destroyMfaChallengeCookie(response)`** — clears the cookie after the challenge is consumed (success *or* failure), enforcing single-use.
- **`readMfaChallengeCookie(request)`** — reads the cookie back on the incoming 2FA endpoint request; returns `undefined` when absent (i.e. the caller falls back to the `challenge` body field used by password logins).

## Relationships

- **`src/infrastructure/http/cookies.ts`** — `cookieOf` is used by `readMfaChallengeCookie` to extract the value from the request.
- **`src/modules/account/session/cookies.ts`** — `hostCookieOptions` supplies the shared `__Host-` cookie attribute defaults (secure, sameSite, path) for both set and clear operations.
- **`src/modules/account/controllers/get-oauth-callback.ts`** — the caller of `createMfaChallengeCookie`; it redirects to the OAuth provider and sets the cookie on that redirect response.
- **`src/modules/account/controllers/post-login-2fa.ts`** / **`post-login-2fa-send.ts`** — call `readMfaChallengeCookie` as a fallback when the request body omits `challenge`; call `destroyMfaChallengeCookie` after the token is spent.

## Notes

- The cookie is intentionally **single-attempt**: both success and failure paths must call `destroyMfaChallengeCookie`. Forgetting the destroy on an error path would leave a live credential in the client.
- `maxAge` is computed as `expiresAt − now` with a `Math.max(0, …)` guard, so a stale or already-expired `expiresAt` yields a zero-lifetime cookie rather than a negative value.
- Because the challenge is a *plaintext credential*, the `__Host-` prefix (implicit `Secure` + no `Domain`) is load-bearing; do not replace `hostCookieOptions` with ad-hoc options without preserving those invariants.
