---
source: src/modules/account/session/cookies.ts
sha256: 5b7b44129fe6e07b0cef400be24148385212fad462481129b77ff63a39cc3ad8
generated_at: 2026-11-08T04:27:28.234011+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/cookies.ts

## Purpose

Cookie service that creates and destroys the two HTTP cookies the session system relies on, decoupled from *how* the session credential is represented. `__Host-session` carries the actual credential (refresh token in JWT mode, session ID in cookie mode); `isAuth` is a non-secret, readable hint so the client shell can render the correct UI before its first authenticated request resolves.

## Key elements

- **`secureCookieOptions()`** — Returns the shared flag set for every credential cookie: `httpOnly`, `secure` (off in dev/test), `sameSite: 'lax'`, `path: '/'`. Is a function (not a constant) so `NODE_ENV` is re-read on each call.
- **`hostCookieOptions()`** — Extends `secureCookieOptions()` by forcing `secure: true` unconditionally, as required by the `__Host-` prefix. Shared by the session cookie, the device cookie, and the OAuth cookies.
- **`createSessionCookie(response, credential, maxAgeMs?)`** — Sets the `__Host-session` cookie with the given credential and, always alongside, the `isAuth` hint. `maxAgeMs` undefined ⇒ browser-session cookie (no `Max-Age`/`Expires`).
- **`destroySessionCookie(response)`** — Clears both the `__Host-session` and `isAuth` cookies using the same flags that `createSessionCookie` set.
- **`createLoggedCookie` / `destroyLoggedCookie`** (module-private) — Set/clear the `isAuth` hint. Deliberately *not* `httpOnly` and *not* `secure`, since it holds no secret.

## Relationships

- **`src/kernel/cookies.ts`** — Source of the `SESSION_COOKIE` name constant used by every function here.
- **`src/infrastructure/runtime/config.ts`** — Provides `isRelaxedEnvironment()` to decide whether `secure` is applied in `secureCookieOptions`.
- **`src/modules/account/session/jwt-strategy.ts`** — Supplies the refresh-token credential that `createSessionCookie` receives in JWT mode.
- **`src/modules/account/session/cookie-strategy.ts`** — Supplies the `ses_…` session-ID credential in cookie mode.
- **`src/modules/account/session/device-cookie.ts`** and OAuth redirects (`deletion-redirect.ts`, `mfa-redirect.ts`, `state.ts`) — Reuse `hostCookieOptions` for their own `__Host-`-prefixed cookies.
- **Controllers** (`post-logout`, `post-logout-everywhere`, `delete-session`, `delete-account`, `get-refresh-token`, `post-reset-confirm`) — Call `createSessionCookie` or `destroySessionCookie` as the terminal I/O step of their respective flows.

## Notes

- `destroySessionCookie` must pass the same attribute set as `createSessionCookie` (path, secure, sameSite, host) — browsers match a `clearCookie` by full attribute set, not name alone.
- `maxAgeMs: undefined` is *meaningful*: it produces a browser-session cookie (no expiry header). A rotated token passes its own remaining lifetime, not a configured tier.
- The `isAuth` hint is always set or cleared *in the same call* as the credential cookie. A hint without a credential (or vice-versa) leaves the client unable to decide whether to attempt session restore.
- `hostCookieOptions` forces `secure: true` even in dev. Browsers accept `Secure` cookies from `http://localhost`, but a LAN-IP dev over plain HTTP will be blocked — use HTTPS or a non-IP hostname in that case.
