---
source: src/modules/account/session/cookies.ts
sha256: 9025a549b70c1dac3e55339507405d8b2ec254108b5a893326a5c32b52eae1da
generated_at: 2026-10-29T02:47:57.303397+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/cookies.ts

## Purpose
HTTP cookie creation and destruction for the account session, decoupled from the session-keep strategy. It manages two cookies: `__Host-session` (carries the credential — refresh token in `jwt` mode, session id in `cookie` mode) and `isAuth` (a readable UI hint so the client shell renders the correct chrome before its first network round-trip).

## Key elements
- **`secureCookieOptions()`** — Returns the shared flag set for credential cookies (`httpOnly`, `secure` gated on environment, `sameSite: 'lax'`, `path: '/'`). A function (not a constant) so `NODE_ENV` is read at call time.
- **`hostCookieOptions()`** — Extends `secureCookieOptions()` with `secure: true` unconditionally, as required by the `__Host-` prefix. Used by the session cookie, device cookie, and OAuth cookies.
- **`createSessionCookie(response, credential, maxAgeMs?)`** — Sets the `__Host-session` cookie and the companion `isAuth` hint with matching lifetime. `maxAgeMs` of `undefined` produces a browser-session cookie (no `Max-Age`/`Expires`).
- **`destroySessionCookie(response)`** — Clears both cookies using the same flags the setter used (browsers match clears by path/domain/attributes, not name alone).
- **`createLoggedCookie` / `destroyLoggedCookie`** (private) — Set/clear the `isAuth` hint. No `httpOnly` or `secure` flags because it holds no secret.

## Relationships
- **`src/kernel/cookies.ts`** — Imports the `SESSION_COOKIE` constant (the `__Host-session` name) used by both create and destroy paths.
- **`src/infrastructure/runtime/config.ts`** — Imports `isRelaxedEnvironment()` to decide whether `secure` is applied in dev/test.
- **`src/modules/account/session/cookie-strategy.ts`**, **`jwt-strategy.ts`**, **`resolver.ts`** — Session strategies and the resolver that invoke `createSessionCookie` / `destroySessionCookie` during login, rotation, and teardown.
- **`src/modules/account/session/device-cookie.ts`** — Shares `hostCookieOptions()` for its own `__Host-` device cookie.
- **`src/modules/account/controllers/post-logout.ts`**, **`post-logout-everywhere.ts`**, **`delete-session.ts`**, **`delete-account.ts`**, **`post-reset-confirm.ts`** — Call `destroySessionCookie` to clear credentials on logout, account deletion, or password reset.
- **`src/modules/account/controllers/get-refresh-token.ts`** — Calls `createSessionCookie` with a rotated token's remaining lifetime.
- **`src/modules/account/oauth/state.ts`**, **`deletion-redirect.ts`**, **`mfa-redirect.ts`** — Use `hostCookieOptions()` for their `__Host-`-prefixed OAuth cookies.

## Notes
- `secureCookieOptions` is a **function**, not a constant — it re-reads `isRelaxedEnvironment()` on every call so hot-reload or env mutation takes effect without a restart.
- The `__Host-` prefix on `SESSION_COOKIE` enforces `Secure` + `Path=/` + no `Domain`. This means plain-HTTP LAN-IP dev setups (e.g. `http://192.168.1.x`) will be rejected by the browser; `localhost` is exempt.
- `isAuth` is intentionally **not** `httpOnly` or `secure`: it is a client-readable hint, not a credential. Its destruction only specifies `path: '/'` (matching the setter), without `domain` or `sameSite`.
- A rotated refresh token passes **its own** remaining lifetime as `maxAgeMs`, not a configured tier — the cookie's expiry mirrors the token it now represents.
