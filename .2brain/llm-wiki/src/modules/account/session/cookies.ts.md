---
source: src/modules/account/session/cookies.ts
sha256: 2919888d2855f3bbe1e99d9eb0c5e68aa61a069d79d19a37a767d5aa1d0d433f
generated_at: 2026-10-15T10:06:11.110581+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/cookies.ts

## Purpose

HTTP cookie creation and destruction for the account session layer. Manages two cookies — `__Host-session` (carries the credential: a refresh token in `jwt` mode or a `ses_…` id in `cookie` mode) and `isAuth` (a non-secret, readable-by-JS hint so the client shell can render auth chrome before its first API response arrives). Decoupled from *how* the session is kept; only handles the transport.

## Key elements

- **`secureCookieOptions()`** — shared flag object for credential cookies: `httpOnly`, `secure` (off only in relaxed envs), `sameSite: 'lax'`, `path: '/'`. Exported so OAuth state/verifier/MFA cookies can reuse it.
- **`hostCookieOptions()`** (private) — extends the above, forcing `secure: true` unconditionally as the `__Host-` prefix requires.
- **`createSessionCookie(response, credential, maxAgeMs?)`** — sets `__Host-session` via `res.cookie` and *always* sets `isAuth` with the same lifetime alongside it.
- **`destroySessionCookie(response)`** — clears both cookies with matching flags so the browser actually removes them.
- **`createLoggedCookie` / `destroyLoggedCookie`** (private) — set/clear the `isAuth` hint; deliberately no `httpOnly` or `secure`.

## Relationships

- **`src/kernel/cookies.ts`** — provides the `SESSION_COOKIE` name constant used here.
- **`src/infrastructure/runtime/config.ts`** — `isRelaxedEnvironment()` gates the `secure` flag in `secureCookieOptions`.
- **`src/modules/account/oauth/state.ts` / `mfa-redirect.ts`** — import `secureCookieOptions` to stamp the same credential-grade flags on OAuth state, PKCE verifier, and MFA-challenge cookies.
- **Controllers** (`post-logout`, `post-logout-everywhere`, `delete-session`, `delete-account-confirm`, `post-reset-confirm`, `get-refresh-token`) — call `createSessionCookie` or `destroySessionCookie` to set or clear the session on the wire.
- **`src/modules/account/session/resolver.ts` / `jwt-strategy.ts` / `cookie-strategy.ts`** — determine *which* credential value is passed to `createSessionCookie`; this file is agnostic to that choice.
- **`src/modules/account/session/device-cookie.ts`** — sibling cookie concern (device identity) kept separate from the auth credential cookie.
- **`src/modules/account/tests/unit/cookies.test.ts`** — unit tests for the create/destroy pairs.

## Notes

- `secureCookieOptions` is a **function**, not a frozen constant — it re-reads `NODE_ENV` on every call, so tests can flip the environment without re-importing.
- The `__Host-` prefix **requires** `Secure` in all environments. `http://localhost` still works in modern browsers, but a LAN-IP dev server over plain HTTP will be rejected by the browser.
- Clearing a cookie must repeat the `path`/`domain`/`sameSite` attributes it was set with; `destroySessionCookie` does this deliberately.
- `isAuth` has **no** `httpOnly` or `secure` by design — it is a readable, non-sensitive UI flag. Do not put credential data in it.
- Passing `maxAgeMs = undefined` produces a browser-session cookie (no `Max-Age`/`Expires`); the server-side session TTL remains the real expiration limit.
