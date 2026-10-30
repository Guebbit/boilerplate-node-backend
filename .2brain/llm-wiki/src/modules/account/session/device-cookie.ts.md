---
source: src/modules/account/session/device-cookie.ts
sha256: 426f95c011d91c051a91c41f8011cd94a82c29799769a3687f1e0732baf21980
generated_at: 2026-10-29T02:48:16.469247+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/device-cookie.ts

## Purpose

Implements the OWASP "familiar device" cookie: after a fully successful login it marks the browser as trusted for that account so the account's per-login-attempt failure budget is skipped on subsequent logins from the same browser. This prevents an attacker who exhausts the budget from also locking out the legitimate owner. One cookie carries up to five HMAC tokens (one per account), so a multi-account browser keeps all its familiarities.

## Key elements

- **`DEVICE_COOKIE`** (export) – The cookie name: `__Host-device`. The `__Host-` prefix enforces host-only + httpOnly + Secure.
- **`tokenFor(email)`** (private) – Computes `base64url(HMAC-SHA256(secret, "device:" + normalizedEmail))`. Returns `''` when no secret is configured, which makes verification fail-closed.
- **`presentedTokens(request)`** (private) – Splits the cookie value on `.` and returns the token list. Never throws; a missing `request.cookies` object yields `[]` (fail-closed) because this runs inside a rate-limiter `skip` callback.
- **`subjectOf(request)`** (private) – Reads `email` from the request **body** via `readBodyField`. Deliberately ignores any authenticated session identity so one account's cookie can't excuse guesses at another.
- **`holdsDeviceCookie(request)`** (export) – Returns `true` when the presented tokens contain a valid token for the account named in the body. Uses `constantTimeEqual` to compare.
- **`presentsFailingDeviceCookie(request)`** (export) – Returns `true` when a cookie is present but does **not** verify for the named account (forged/stale). Intended so the rate limiter can meter token-guessing in a separate budget.
- **`rememberDevice(request, response, email)`** (export) – After a successful login, prepends the new token to the existing set (dedup, cap at 5) and sets the cookie with a 180-day max-age using `hostCookieOptions()`.

## Relationships

- **`src/infrastructure/security/constant-time.ts`** – Imports `constantTimeEqual` for timing-safe token comparison in `holdsDeviceCookie`.
- **`src/infrastructure/persistence/normalize-email.ts`** – Imports `normalizeEmail` so `Ada@X.com` and `ada@x.com` produce the same token.
- **`src/infrastructure/http/middlewares/rate-limit.ts`** – Imports `readBodyField` (used by `subjectOf`). The file's own docs note it executes inside a rate-limiter `skip` predicate, which is why `presentedTokens` must never throw.
- **`src/modules/account/session/config.ts`** – Imports `sessionConfig()` to read `NODE_DEVICE_COOKIE_SECRET`.
- **`src/modules/account/session/cookies.ts`** – Imports `hostCookieOptions()` for the shared `__Host-`/httpOnly/Secure cookie attribute set.
- **`src/domain-primitives/time.ts`** – Imports `DAY_MS` to compute the 180-day max-age constant.
- **`src/modules/account/rate-limits.ts`** – Consumes `holdsDeviceCookie` / `presentsFailingDeviceCookie` to decide whether to skip or meter an attempt.
- **Controllers (`post-login`, `post-login-2fa`, `post-login-restore`, `get-oauth-callback`)** – Call `rememberDevice` after their respective successful-login paths.
- **`src/modules/account/tests/unit/device-cookie.test.ts`** – Unit tests for the module's exported functions.

## Notes

- **Fail-closed everywhere:** absent secret → empty token → `holdsDeviceCookie` is always `false`; missing `request.cookies` → empty list → same. No code path grants a pass without a valid HMAC.
- **Scope of the exemption is narrow:** the cookie only skips the *per-account* failure budget. Per-address and per-IP/UA block budgets still apply, so it is not a blanket rate-limit bypass.
- **Body-only subject:** `subjectOf` reads only the request body. A signed-in caller cannot leverage their own familiar cookie to skip the budget on a *different* account they name in the body.
- **Separator choice:** `.` was selected because it does not appear in the base64url alphabet, guaranteeing tokens can't be ambiguous when split.
- **`__Host-` prefix** means the browser rejects the cookie if it lacks `Secure` or `Path: /`; the server must never set `domain`.
