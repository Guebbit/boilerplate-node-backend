---
source: src/modules/account/session/device-cookie.ts
sha256: 95727ee55071ce68a7d2a4fae713851e95d7f7a348c2277be2d1967f89962d16
generated_at: 2026-11-08T04:27:45.532231+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/device-cookie.ts

## Purpose

Implements the OWASP "familiar device" cookie: after a fully successful login, a token is written to a host-only, httpOnly cookie so that the same browser can keep signing in to that account even after an attacker has exhausted the account's per-login failure budget. Without this, spending an account's lockout budget also locks out its legitimate owner. The cookie skips only the per-account budget; per-address and per-block rate limits still apply.

## Key elements

- **`DEVICE_COOKIE`** (exported) — the cookie's name, sourced from `cookieData.device.name`.
- **`holdsDeviceCookie(request)`** (exported) — returns `true` when the request's cookie contains a token that verifies (via `constantTimeEqual`) against the HMAC expected for the email named in the request body.
- **`presentsFailingDeviceCookie(request)`** (exported) — returns `true` when the request names an account, presents at least one token, but none of them verify. Used to count forged/stale tokens in a separate rate-limit bucket.
- **`rememberDevice(request, response, email)`** (exported) — after a successful login, prepends the new account's token to any tokens already held (newest-first, max 5), then sets the cookie via `response.cookie` with `hostCookieOptions()` and the configured max-age.
- **`tokenFor(email)`** (internal) — computes `base64url(HMAC-SHA256(NODE_DEVICE_COOKIE_SECRET, "device:" + normalizeEmail(email)))`. Returns `''` if no secret is configured, in which case verification is a no-op.
- **`presentedTokens(request)`** (internal) — reads the cookie value from `request.cookies`, splits on `.`, and filters empties. Fails closed (empty array) if `cookie-parser` was never mounted.
- **`subjectOf(request)`** (internal) — extracts the `email` field from the request body via `readBodyField`; the account the request is *about*, not the caller's own identity.
- Constants: `MAX_TOKENS` (5), `DEVICE_COOKIE_MAX_AGE_MS`, `SEPARATOR` (`'.'`, chosen to be outside base64url so tokens can't contain it).

## Relationships

- **`./config`** — reads `NODE_DEVICE_COOKIE_SECRET` via `sessionConfig()`; if unset, tokens are empty and the feature is inert.
- **`./cookies`** — uses `hostCookieOptions()` so the device cookie shares the same `__Host-`, `Secure`, `httpOnly` posture as the session cookie.
- **`@infrastructure/security/constant-time`** — token comparison uses `constantTimeEqual` to avoid timing side-channels.
- **`@infrastructure/persistence/normalize-email`** — email is normalised before the HMAC so `Ada@X.com` and `ada@x.com` produce the same token.
- **`@infrastructure/http/middlewares/rate-limit`** — uses `readBodyField` to pull the target `email` from the body; the module is designed to run inside a rate-limiter `skip` callback, so it must never throw.
- **`@infrastructure/http/cookies.generated`** — source of the cookie name and max-age (`cookieData.device`).
- **`src/modules/account/rate-limits.ts`** (caller) — consumes `holdsDeviceCookie` (to skip the per-account budget) and `presentsFailingDeviceCookie` (to apply a separate token-guessing budget).
- **Login controllers** (`post-login.ts`, `post-login-2fa.ts`, `post-login-restore.ts`, `get-oauth-callback.ts`) — call `rememberDevice` after each path that constitutes a fully successful authentication.

## Notes

- The token is an HMAC keyed by a deployment secret; it carries no PII and proves nothing about a password. Forging one requires the secret.
- A request naming *no* account (missing `email` in body) can never hold or fail a device cookie — both exported predicates return `false`.
- `rememberDevice` preserves up to four pre-existing tokens, so a browser can be familiar for up to five accounts simultaneously; the oldest drops first.
- Because this runs inside a rate-limiter `skip`, `presentedTokens` treats a missing `request.cookies` object as "no cookie" rather than throwing — a throw would turn every login into a 500.
- The cookie uses the `__Host-` prefix (host-only, `Secure`, `httpOnly`, no `Path`), matching the session cookie's security posture.
