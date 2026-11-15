---
source: src/modules/account/session/cookies.ts
sha256: 2023daa8da713915c5a443e8dca9399c6aa91feaf1b678a6f2a291e81169e50a
generated_at: 2026-11-14T18:56:42.939749+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/cookies.ts

## Purpose

Centralized HTTP cookie service for the account session layer. It owns the two cookies the browser holds on the user's behalf — `__Host-session` (the actual credential: a refresh token in JWT mode or a `ses_…` id in cookie mode) and `isAuth` (a non-secret, script-readable hint so the client shell can render auth chrome before its first API call returns) — and exposes create/destroy pairs so callers never hand-roll cookie flags.

## Key elements

- **`hostCookieOptions()`** (exported) — Returns the full flag set for any `__Host-`-prefixed cookie: `httpOnly`, `secure: true` (forced in every environment, required by the `__Host-` prefix), `sameSite: 'lax'`, `path: '/'`. Re-exported so `device-cookie.ts` and the OAuth cookie files can share identical attributes.
- **`createSessionCookie(response, credential, maxAgeMs?)`** (exported) — Sets the `__Host-session` cookie with the given credential and optional `maxAge`. `maxAge` left undefined produces a browser-session cookie (no `Max-Age`/`Expires`). Always calls `createLoggedCookie` with the same lifetime so the hint and credential are born together.
- **`destroySessionCookie(response)`** (exported) — Clears `__Host-session` and the `isAuth` hint. Must pass the same `path`/`domain`/`secure` flags the browser used to accept the set, or the clear is ignored.
- **`secureCookieOptions()`** (internal) — Base flag set; identical to `hostCookieOptions` except `secure` is gated on `isRelaxedEnvironment()` (i.e. off in dev/test). Not exported because the `__Host-` requirement means every cookie in this module effectively needs `secure: true`.
- **`createLoggedCookie` / `destroyLoggedCookie`** (internal) — Manage the `isAuth` hint cookie. Deliberately omits `httpOnly` and `secure` so client-side JS can read it over any transport.

## Relationships

- **`src/kernel/cookies.ts`** — Provides the `SESSION_COOKIE` name constant used in every set/clear call in this file.
- **`src/infrastructure/runtime/config.ts`** — Supplies `isRelaxedEnvironment()` to decide whether the `secure` flag can be relaxed in dev/test.
- **`src/modules/account/session/cookie-strategy.ts`** / **`jwt-strategy.ts`** — Call `createSessionCookie` / `destroySessionCookie` to materialize or invalidate the browser-held credential.
- **`src/modules/account/session/device-cookie.ts`** — Consumes `hostCookieOptions()` for its own `__Host-` device cookie.
- **`src/modules/account/session/resolver.ts`** — Reads the `SESSION_COOKIE` value from the incoming request to reconstruct the session.
- **Controllers** (`post-logout.ts`, `post-logout-everywhere.ts`, `delete-session.ts`, `delete-account.ts`, `get-refresh-token.ts`, `post-reset-confirm.ts`) — Call `destroySessionCookie` (or `createSessionCookie` after a token rotation) as part of their response.
- **OAuth cookies** (`state.ts`, `mfa-redirect.ts`, `deletion-redirect.ts`) — Reuse `hostCookieOptions()` for their `__Host-`-prefixed state cookies.

## Notes

- `secureCookieOptions` is a **function**, not a frozen object literal, so each call re-evaluates `isRelaxedEnvironment()` against the current `NODE_ENV`. Importing it as a constant would bake in the env at module-load time and break test overrides.
- The `__Host-` prefix on the session cookie name (defined in `@kernel/cookies`) means the browser **rejects** any cookie without `Secure`, even on `localhost`. A plain-HTTP dev on a LAN IP will see the cookie silently dropped; the fix is HTTPS or a `.localhost`-style hostname, not removing the flag.
- `maxAge` semantics: passing `undefined` is *not* the same as `0`. `undefined` → browser-session cookie (lives until the tab closes); `0` → immediate expiry. Callers rotating tokens are expected to pass the **new** token's remaining lifetime, not a configured tier.
- `createLoggedCookie` / `destroyLoggedCookie` are intentionally **not** exported. They are always paired with the session cookie calls above; exposing them invites callers to set or clear the hint without the credential, producing a shell that shows (or hides) auth UI with no backing session.
