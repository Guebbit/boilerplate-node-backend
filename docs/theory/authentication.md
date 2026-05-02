# Authentication

## Strategy: dual-token

The boilerplate uses two tokens:

| Token             | Lifetime | Transport                      | Revocable          |
| ----------------- | -------- | ------------------------------ | ------------------ |
| **Access token**  | Minutes  | `Authorization: Bearer` header | No (stateless)     |
| **Refresh token** | Days     | `HttpOnly` cookie              | Yes (stored in DB) |

This is a deliberate trade-off. Short-lived access tokens limit damage if intercepted. Long-lived refresh tokens allow seamless re-authentication. Storing refresh tokens in the database allows per-session revocation (logout everywhere).

## Token flow

```
Login
  └─▶ Server issues access token + refresh token
        └─▶ Client stores access token in memory
        └─▶ Refresh token set as HttpOnly cookie (automatic)

Authenticated request
  └─▶ Client sends: Authorization: Bearer <access_token>
  └─▶ Middleware verifies token
        └─▶ Valid → proceed
        └─▶ Expired → check refresh cookie → issue new access token → proceed

Logout
  └─▶ Server removes refresh token from user.tokens[]
  └─▶ Clears the cookie
```

## Token storage in the user document

Each user has a `tokens` array that holds all active refresh tokens (one per session/device):

```ts
tokens: [{ value: '…', type: ETokenType.REFRESH, expiresAt: Date }];
```

Calling `user.tokenRemoveAll()` logs out all sessions simultaneously.

## Password reset

Password reset uses the same token infrastructure with `ETokenType.PASSWORD_RESET`. A reset link is emailed; the token is single-use and removed after use.

## Middleware stack

- `getAuth` — optional auth. Safe to use on public endpoints that show more data to logged-in users.
- `isAuth` — gates the route behind authentication.
- `isAdmin` — additionally requires `user.admin === true`.

Always apply `isAdmin` after `isAuth` — it reads from `req.user` which `isAuth` populates.
