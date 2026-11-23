---
source: src/modules/account/session/cookies.ts
source_sha256: 40769ea4b36217eb82f3653f628503ebc8937032e81af02db76285388887d08b
context_sha256: 121ddc397a836558e68841dd79f06f93a0b0556f620ac01100de3b10158c0f83
generated_at: 2026-11-22T03:46:09.039133+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/session/cookies.ts

## Purpose
Cookie service for the account session: creates and destroys the HTTP cookies, independent of how the session is stored. Two cookies are involved: `__Host-session` (`SESSION_COOKIE`), which carries the credential (refresh token in `jwt` mode, `ses_…` session id in `cookie` mode), and `isAuth`, a non-secret hint so the client can render the right UI before its first request returns.

## Key elements
- `hostCookieOptions()` (exported): flags for host-bound credential cookies: `httpOnly`, `secure: true` (forced in every environment, as the `__Host-` prefix requires), `sameSite: 'lax'`, `path: '/'`. It is built on the private `secureCookieOptions()`.
- `secureCookieOptions()` (private): the shared credential flags. `secure` is `!isRelaxedEnvironment()`. It is a function so `NODE_ENV` is read on each call rather than frozen at import.
- `createSessionCookie(response, credential, maxAgeMs?)` (exported): sets the `__Host-session` cookie and, in the same call, the `isAuth` hint with the same lifetime. If `maxAgeMs` is `undefined`, no `Max-Age`/`Expires` is emitted, so it is a browser-session cookie.
- `destroySessionCookie(response)` (exported): clears the session cookie using the same flags it was set with, then clears the hint.
- `createLoggedCookie` / `destroyLoggedCookie` (private): set or clear the `isAuth` cookie with value `'true'`. It has no `httpOnly` or `secure`, and uses `sameSite: 'lax'` and `path: '/'`.

## Relationships
- `src/kernel/cookies.ts`: provides the `SESSION_COOKIE` name.
- `src/infrastructure/runtime/config.ts`: provides `isRelaxedEnvironment()`, which decides `secure` in `secureCookieOptions`.
- The neighbor files in `session/` (`cookie-strategy.ts`, `jwt-strategy.ts`, `device-cookie.ts`, `resolver.ts`), the account controllers (logout, delete session/account, refresh token, reset confirm) and the `oauth/` modules are linked by the dependency graph. The file's doc comments say the device cookie and the OAuth cookies reuse `hostCookieOptions`. The other links are not visible in this file.

## Notes
- A clear only works if its path, domain and attributes match the original cookie, so `destroySessionCookie` must keep using the same options as `createSessionCookie`.
- The session cookie and the `isAuth` hint are always set and cleared together, so the client never sees one without the other.
- A rotated token passes its own remaining lifetime as `maxAgeMs`, not a configured tier. The server-side session TTL remains the real limit for browser-session cookies.
- `Secure` is forced on, so LAN-IP development over plain HTTP won't work. `http://localhost` is unaffected.
- The file's module doc points to a flag-by-flag rationale in the account sessions documentation (the "cookie flag by flag" section).
