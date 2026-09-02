# src/modules/account/session/cookies.ts

## Purpose

Encapsulates all HTTP cookie creation and destruction for the account session, keeping cookie mechanics (flags, paths, clearing) in one place and decoupled from JWT token logic. Manages two cookies with distinct roles: `jwt` (the long-lived refresh-token credential) and `isAuth` (a non-secret boolean hint that lets the client shell render authenticated chrome before the first API round-trip completes).

## Key elements

- **`createRefreshCookie(response, token, remember?)`** — Sets the `jwt` cookie with `httpOnly: true`, `secure` (production only), `sameSite: 'lax'`, `path: '/'`. Accepts `remember` as either a `RefreshTokenExpiryTime` tier (resolved via `getExpiryTimeMilliseconds`) or a raw `maxAge` in ms (used when a rotated token carries its own remaining lifetime).
- **`destroyRefreshCookie(response)`** — Clears the `jwt` cookie. Flags (`httpOnly`, `secure`, `sameSite`, `path`) must mirror `createRefreshCookie` because browsers match a clear by path/domain/attributes, not name alone.
- **`createLoggedCookie(response, remember?)`** — Sets the `isAuth` cookie to `'true'` with no `httpOnly` or `secure` (client-readable hint). `maxAge` mirrors the refresh cookie so both expire together.
- **`destroyLoggedCookie(response)`** — Clears the `isAuth` cookie (only `path: '/'` needed since it has no `httpOnly`/`secure` attributes).
- All four are pure Express `Response` helpers; they carry no token logic themselves.

## Relationships

- **`./config`** — Imports the `RefreshTokenExpiryTime` type and `getExpiryTimeMilliseconds` resolver. The tier-to-ms mapping lives entirely in config; this file only picks between tier and raw-ms at the call site.
- **`./session.ts`** — The session orchestrator that pairs cookie calls with JWT issuance/revocation. `cookies.ts` is the "how to write to the cookie jar" layer beneath it.
- **Controllers** (`get-refresh-token.ts`, `post-logout.ts`, `post-logout-everywhere.ts`, `post-reset-confirm.ts`, `delete-account-confirm.ts`) — Call the create/destroy functions as part of their response. `get-refresh-token` is the only caller that passes a raw numeric `maxAge` (rotated-token lifetime); the others pass a tier or omit `remember`.
- **`tests/unit/cookies.test.ts`** — Unit-tests the four exports in isolation (cookie flags, `maxAge` resolution, clear-flag matching).

## Notes

- **Clear-flag coupling:** `destroyRefreshCookie` must stay in lock-step with `createRefreshCookie`'s flags. Adding a new attribute (e.g. `domain`) to the create side without mirroring it in the clear will silently leave the cookie behind.
- **`secure` is environment-gated:** In dev (`NODE_ENV !== 'production'`) the `jwt` cookie is set over plain HTTP. Do not assume `secure: true` in local testing.
- **`remember` is a union type** (`RefreshTokenExpiryTime | number`), not a single type. Callers that rotate tokens bypass the config tier entirely by passing milliseconds directly.
- **`isAuth` is intentionally readable by client JS.** Do not add `httpOnly` to it; the client shell depends on reading it synchronously.
