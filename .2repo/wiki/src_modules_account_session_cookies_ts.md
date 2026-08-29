# src/modules/account/session/cookies.ts

## Purpose
Provides thin wrapper functions for setting and clearing two HTTP cookies (`jwt` and `isAuth`) used in the authentication flow. It isolates cookie manipulation from JWT signing/verification logic so that controllers can manage cookie state without embedding cookie configuration inline.

## Key elements
- **`createRefreshCookie(response, token, remember?)`** — Sets the `jwt` cookie (httpOnly, sameSite `lax`, path `/`) with a `maxAge` derived from the `remember` parameter. The `secure` flag is enabled only when `NODE_ENV === 'production'`.
- **`destroyRefreshCookie(response)`** — Clears the `jwt` cookie with matching flags so the browser removes it.
- **`createLoggedCookie(response, remember?)`** — Sets a non-httpOnly `isAuth` cookie to the string `'true'`, intended as a UI hint for logged-in state. Shares the same `maxAge` logic as the refresh cookie.
- **`destroyLoggedCookie(response)`** — Clears the `isAuth` cookie (path `/` only; no other flags needed since the cookie was set without them).

All expiry times are resolved through `getExpiryTimeMilliseconds` imported from `./config`, accepting an optional `RefreshTokenExpiryTime` value.

## Relationships
- **`./config.ts`** — Imports the `RefreshTokenExpiryTime` type and `getExpiryTimeMilliseconds` helper; the single source of truth for cookie lifetimes.
- **`controllers/post-login.ts`** — Calls `createRefreshCookie` and `createLoggedCookie` after a successful login.
- **`controllers/post-logout.ts`** — Calls `destroyRefreshCookie` and `destroyLoggedCookie` for single-session logout.
- **`controllers/post-logout-everywhere.ts`** — Calls the destroy functions to clear session cookies across all sessions.
- **`controllers/delete-account-confirm.ts`** — Clears session cookies as part of the account-deletion flow.
- **`controllers/post-reset-confirm.ts`** — Clears session cookies after a password-reset confirmation to invalidate any prior session.
- **`tests/unit/cookies.test.ts`** — Unit-tests all four exported functions against a mocked Express `Response`.

## Notes
- The `secure` flag is gated on `process.env.NODE_ENV === 'production'` at call time, not at import time. In non-production environments the `jwt` cookie will be sent over plain HTTP.
- `isAuth` is intentionally **not** httpOnly, so client-side JavaScript can read it as a logged-in hint. It carries no secret.
- Cookie name is hardcoded to `'jwt'` (the cookie name) even though the value is a refresh token, not a JWT per se.
- `destroyRefreshCookie` repeats the `secure`/`httpOnly`/`sameSite` flags to match the original `Set-Cookie` attributes required by the browser to identify the cookie to remove.
