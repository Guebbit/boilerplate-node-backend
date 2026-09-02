# src/modules/account/session/session.ts

## Purpose

Single-entry-point helper that mints a complete live session (refresh token → cookies → access token) in one call. Extracted from `postLogin` so that every flow that needs to create or re-create a session — password change, re-auth, 2FA completion — shares identical cookie/token logic instead of duplicating it.

## Key elements

- **`issueSession(response, userId, remember?, amr?)`** — the only export. Chains `createRefreshToken` → `createRefreshCookie` + `createLoggedCookie` → `createAccessToken` and returns the signed access token (`Promise<string>`). Sets cookies directly on the passed Express `Response`. Throws if the refresh token cannot be persisted or signed.

## Relationships

- **`./jwt`** — provides `createRefreshToken` (step 1) and `createAccessToken` (step 3).
- **`./cookies`** — provides `createRefreshCookie` and `createLoggedCookie` (step 2, both called before the access-token exchange).
- **`./config`** — supplies the `RefreshTokenExpiryTime` type used to type the optional `remember` parameter.
- **`post-login.ts`** — original source of this logic; now calls `issueSession` rather than inlining the three steps.
- **`post-password-change.ts`** — reuses `issueSession` to re-mint a session after a password update.
- **`post-login-2fa.ts`** / **`post-reauth.ts`** — additional callers that mint a session after their respective auth steps complete.

## Notes

- `remember` and `amr` are both optional; when omitted they fall back to the defaults inside `createRefreshToken` (`amr` defaults to `['pwd']`) and to `postLogin`'s own "remember me" default respectively. Callers don't need to pass them unless they want a non-standard tier or auth method.
- The function is **not** idempotent: it always creates a *new* refresh token and overwrites the cookies on `response`. Callers are responsible for invalidating any prior session upstream.
- See `docs/modules/account-sessions.md` (referenced in the module docblock) for the broader session-lifecycle documentation.
