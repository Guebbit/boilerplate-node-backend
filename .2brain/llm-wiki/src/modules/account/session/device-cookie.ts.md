---
source: src/modules/account/session/device-cookie.ts
sha256: 15d290378fe09d5f998451be55f68868ff0c4e0f67261aa31ffd5c3f05c4b58f
generated_at: 2026-10-15T10:06:29.173150+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/device-cookie.ts

## Purpose

Implements the OWASP "familiar-device" cookie: after a fully successful login, the browser stores up to five HMAC-SHA256 tokens (one per account) in an httpOnly cookie. On subsequent logins, a valid token lets the browser skip the **per-account** failure budget, so an attacker who exhausts that budget cannot lock out the legitimate owner. The cookie never bypasses per-address or per-IP budgets.

## Key elements

- **`DEVICE_COOKIE`** (`'device'`) – the cookie name.
- **`tokenFor(email)`** (internal) – returns a base64url HMAC-SHA256 of `"device:" + normalizeEmail(email)` keyed by `NODE_DEVICE_COOKIE_SECRET`; returns `''` when the secret is unset.
- **`presentedTokens(request)`** (internal) – splits the cookie value on `.` and returns the token array; returns `[]` if `request.cookies` is absent (e.g. `cookie-parser` not mounted).
- **`subjectOf(request)`** (internal) – extracts the `email` field from the request **body** via `readBodyField`; deliberately ignores any signed-in session identity.
- **`holdsDeviceCookie(request)`** – `true` when the presented tokens include one that constant-time-matches `tokenFor(subjectOf(request))`.
- **`presentsFailingDeviceCookie(request)`** – `true` when the request names an account, presents one or more tokens, but none verify; used to feed a separate rate-limit bucket for token-guessing.
- **`rememberDevice(request, response, email)`** – prepends the new token, deduplicates, caps at 5, and writes the cookie with `secureCookieOptions()` and a 180-day `maxAge`.

## Relationships

- **`./cookies`** – imports `secureCookieOptions` for the cookie's security flags.
- **`./config`** – imports `sessionConfig` to read `NODE_DEVICE_COOKIE_SECRET`.
- **`@infrastructure/security/constant-time`** – imports `constantTimeEqual` for timing-safe token comparison in `holdsDeviceCookie`.
- **`@infrastructure/persistence/normalize-email`** – imports `normalizeEmail` so casing/whitespace variants of an address produce the same token.
- **`@infrastructure/http/middlewares/rate-limit`** – imports `readBodyField` to extract the email field; the module is designed to run inside a rate-limiter's `skip` predicate (throwing there would 500 every login).
- **`src/modules/account/rate-limits.ts`** – consumes `holdsDeviceCookie` / `presentsFailingDeviceCookie` to decide whether to skip or bucket a login attempt.
- **`src/modules/account/controllers/post-login.ts`**, **`post-login-2fa.ts`**, **`get-oauth-callback.ts`** – call `rememberDevice` after their respective successful authentication flows.
- **`src/modules/account/tests/unit/device-cookie.test.ts`** – unit tests for the module's exported and internal helpers.

## Notes

- **Body email, not session email.** `subjectOf` reads the email from the request body, not from an authenticated session. This prevents a logged-in user's own device cookie from excusing guesses against a *different* account they name in the body.
- **Fail-closed on missing secret.** If `NODE_DEVICE_COOKIE_SECRET` is unset, `tokenFor` returns `''`, `holdsDeviceCookie` always returns `false`, and the per-account budget applies in full.
- **Separator choice.** `.` is outside the base64url alphabet, so a single token can never be ambiguous with the separator.
- **`presentsFailingDeviceCookie` exists to isolate token-guessing** into its own rate-limit bucket, separate from the password-guessing budget it would otherwise excuse.
- **Token cap & ordering.** `rememberDevice` keeps the newest token first and drops the oldest beyond 5; signing into a second account does not evict the first.
