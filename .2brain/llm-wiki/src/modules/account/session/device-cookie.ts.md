---
source: src/modules/account/session/device-cookie.ts
source_sha256: 95727ee55071ce68a7d2a4fae713851e95d7f7a348c2277be2d1967f89962d16
context_sha256: 3954682570eebbd837a6288db4c16d840763e50ab178c1f5bd3386fa2e8d9461
generated_at: 2026-11-22T03:46:17.448056+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/session/device-cookie.ts

## Purpose
Implements the "familiar device" cookie (OWASP device cookie). After a fully successful login, the browser receives a cookie that lets it keep signing in even when an attacker's guesses have exhausted an account's failure budget. This keeps an attacker from locking the owner out. The cookie only skips the per-account failure budget, never the per-address or per-block budgets.

## Key elements
- `DEVICE_COOKIE` — the cookie name, taken from `cookieData.device.name` (`@infrastructure/http/cookies.generated`).
- `holdsDeviceCookie(request)` — true if the cookie carries a token that verifies for the account named in the request body's `email`. Compares in constant time.
- `presentsFailingDeviceCookie(request)` — true if the request names an account and presents a cookie that does not vouch for it (forged or stale). Meant for a separate budget, so token guessing is bounded apart from password guessing.
- `rememberDevice(request, response, email)` — sets the cookie after a successful login. It puts the new token first, keeps previously held tokens, and caps the list at 5, dropping the oldest. The cookie uses `hostCookieOptions()` plus `maxAge` from `cookieData.device.maxAgeMs`.
- Internal helpers:
  - `tokenFor(email)` — base64url HMAC-SHA256 of `device:<normalised email>`, keyed by `NODE_DEVICE_COOKIE_SECRET`. It returns `''` when no secret is configured.
  - `presentedTokens(request)` — splits the cookie value on `.` and drops empty parts.
  - `subjectOf(request)` — reads `email` from the request body only.

## Relationships
- `@infrastructure/security/constant-time` — `constantTimeEqual` compares presented and expected tokens.
- `@infrastructure/persistence/normalize-email` — `normalizeEmail` makes tokens case-insensitive per address.
- `@infrastructure/http/middlewares/rate-limit` — `readBodyField` reads the body email. The file's comments say the checks run inside a rate limiter's `skip`.
- `./cookies` — `hostCookieOptions()` supplies the cookie options.
- `./config` — `sessionConfig().NODE_DEVICE_COOKIE_SECRET` supplies the HMAC key.
- Tests live in `src/modules/account/tests/unit/device-cookie.test.ts`.
- The login controllers (`post-login`, `post-login-2fa`, `post-login-restore`, `get-oauth-callback`) and `src/modules/account/rate-limits.ts` are graph neighbors. The file does not import them, so their exact use of these exports is not shown here.

## Notes
- **Fail-closed:** with no secret configured, `tokenFor` returns `''`, nothing verifies, and `rememberDevice` sets no cookie. If cookies were never parsed (no `cookie-parser`), the request is treated as having no cookie instead of throwing. Throwing would turn every login into a 500 when this runs inside a rate limiter's `skip`.
- **Subject comes from the body only.** A signed-in caller's own address is deliberately not used. Otherwise their own device cookie would excuse guesses at another account.
- Tokens are not tied to a password and name no one. Forging one requires the secret.
- `.` is the token separator because it cannot appear in base64url.
- The cookie is `__Host-` prefixed, host-only and httpOnly, like the session cookie. Each successful login renews its lifetime.
