# src/modules/account/session/cookies.ts

## Purpose

HTTP cookie creation and destruction for the two session cookies (`jwt` and `isAuth`), kept deliberately separate from JWT token logic. The `jwt` cookie carries the long-lived refresh token (httpOnly credential); the `isAuth` cookie is a non-secret flag the client shell reads to render the correct UI before its first API response arrives.

## Key elements

- **`createRefreshCookie(response, token, remember?)`** — Sets the `jwt` cookie with `httpOnly`, `secure` (production only), `sameSite: lax`, `path: /`, and a `maxAge` derived from `getExpiryTimeMilliseconds(remember)`.
- **`destroyRefreshCookie(response)`** — Clears the `jwt` cookie using the same attribute set that `createRefreshCookie` used (browsers match clears by path/domain/attributes, not name alone).
- **`createLoggedCookie(response, remember?)`** — Sets the `isAuth` cookie to `"true"`. Intentionally omits `httpOnly` and `secure` so client-side code can read it. Same `sameSite`/`path`/`maxAge` policy.
- **`destroyLoggedCookie(response)`** — Clears the `isAuth` cookie with `path: /`.

## Relationships

- **`./config`** — Source of the `RefreshTokenExpiryTime` type and `getExpiryTimeMilliseconds()` used for every `maxAge` calculation. Changing expiry logic lives there, not here.
- **`post-login.ts`** — Calls `createRefreshCookie` + `createLoggedCookie` after a successful login.
- **`post-logout.ts` / `post-logout-everywhere.ts`** — Call `destroyRefreshCookie` + `destroyLoggedCookie` to clear the session.
- **`delete-account-confirm.ts` / `post-reset-confirm.ts`** — Also destroy both cookies as part of account deletion and password-reset flows.
- **`cookies.test.ts`** — Unit tests covering all four exports.

## Notes

- `secure` is conditional on `NODE_ENV === 'production'` so local `http://` development still works; the destroy functions must mirror this flag or the browser won't match the cookie to clear.
- `path: '/'` is required because the refresh and logout endpoints live on different routes; without it the cookie won't be sent to every API call.
- The `isAuth` cookie carries no secret data — its absence of `httpOnly`/`secure` is intentional, not an oversight.
- Flag-by-flag rationale is documented in `docs/modules/account-sessions.md`.
