---
source: src/modules/account/session/cookies.ts
sha256: 80ce3c56f06fd2ca24e34f5a125cb8b8eaee2f96e4865cea4c42e246b1c94b52
generated_at: 2026-10-14T08:59:14.641250+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/cookies.ts

## Purpose

Centralizes HTTP cookie creation and destruction for the account session, decoupled from *how* the session is maintained (JWT vs. cookie mode). Two cookies serve two jobs: `__Host-session` carries the credential (refresh token or session ID), and `isAuth` is a non-secret flag the client shell reads to render auth chrome before the first API call resolves.

## Key elements

- **`secureCookieOptions()`** (exported) — Returns shared flag set (`httpOnly`, `secure` (conditional on env), `sameSite: 'lax'`, `path: '/'`) used by every credential-bearing cookie in the app. A function, not a constant, so `NODE_ENV` is read at call time.
- **`hostCookieOptions()`** (internal) — `secureCookieOptions()` with `secure: true` forced, satisfying the `__Host-` prefix requirement.
- **`createSessionCookie(response, credential, maxAgeMs?)`** (exported) — Sets the `__Host-session` cookie. `maxAgeMs` omitted → browser-session cookie (no `Max-Age`/`Expires`); the server-side TTL remains the real limit.
- **`destroySessionCookie(response)`** (exported) — Clears the `__Host-session` cookie. Must pass the same flags used to set it.
- **`createLoggedCookie(response, maxAgeMs?)`** (exported) — Sets the `isAuth` hint cookie (no `httpOnly`/`secure`). Always set alongside `createSessionCookie` with the same `maxAgeMs`.
- **`destroyLoggedCookie(response)`** (exported) — Clears the `isAuth` cookie.

## Relationships

- **`src/kernel/cookies.ts`** — Source of the `SESSION_COOKIE` constant (the literal `__Host-session` name) used by both create and destroy.
- **`src/infrastructure/runtime/config.ts`** — Provides `isRelaxedEnvironment()` so `secure` is dropped only in dev/test.
- **`src/modules/account/session/jwt-strategy.ts`** — Calls `createSessionCookie` with the refresh token (jwt mode) and `destroySessionCookie` on revocation.
- **`src/modules/account/session/cookie-strategy.ts`** — Calls `createSessionCookie` with the `ses_…` ID (cookie mode).
- **`src/modules/account/controllers/post-logout.ts`**, **`post-logout-everywhere.ts`**, **`delete-account-confirm.ts`**, **`post-reset-confirm.ts`** — Call the destroy pair to clear cookies on account-mutating actions.
- **`src/modules/account/controllers/get-refresh-token.ts`** — Calls the create pair after token rotation, passing the rotated token's own remaining lifetime as `maxAgeMs`.
- **`src/modules/account/oauth/state.ts`**, **`mfa-redirect.ts`** — Import `secureCookieOptions()` for their state/verifier/MFA-challenge cookies.
- **`src/modules/account/tests/unit/cookies.test.ts`** — Unit tests for the flag sets and Express call signatures.

## Notes

- `secureCookieOptions` is a **function**, not an object literal, intentionally: freezing `NODE_ENV` at import time would break environments that change it mid-process (e.g. tests that toggle env vars between suites).
- `__Host-` prefix mandates `Secure`, `Path=/`, and no `Domain`. The `hostCookieOptions` wrapper enforces the first two; the browser rejects the cookie if `Domain` is present, so it is simply never set.
- `destroySessionCookie` must pass the same `path`/`sameSite`/`secure` flags used at creation — a browser matches a clear by those attributes, not by cookie name alone.
- `isAuth` is deliberately **not** `httpOnly` and **not** `secure`: it carries no credential and must be readable by client-side JS even over `http://` in local dev.
