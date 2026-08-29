# src/modules/account/session/jwt.ts

## Purpose

Issues and verifies the application's JWTs (access and refresh tokens). Access-token verification is a pure signature check; refresh-token verification additionally confirms the token is still present on the user document. Refresh tokens are persisted to the user record at creation time, making revocation a matter of removing the stored value.

## Key elements

- **`TokenData`** — minimal payload shape (`{ id: string }`) shared by both token types.
- **`verifyAccessToken(token)`** — stateless `jsonwebtoken.verify` against the access-token secret. Resolves with `TokenData`.
- **`verifyRefreshToken(token)`** — signature check against the refresh-token secret, then `userRepository.findByTokenValue` to confirm the token hasn't been revoked. Rejects with `'Forbidden'` if the token is absent from the user document.
- **`createRefreshToken(id, remember?)`** — loads the user (with credentials), signs a HS256 refresh JWT carrying a random `jti` (`randomUUID()`), then persists it via `userRepository.tokenAdd`. Returns the updated user document.
- **`recordRefreshTokenUse(refreshToken)`** — calls `userRepository.tokenTouch` to stamp the token's last-used time. **Never rejects**; failures are swallowed by design.
- **`createAccessToken(refreshToken)`** — verifies the refresh token (including the DB lookup) and signs a new short-lived access token.
- **Re-exports from `./config`** — `RefreshTokenExpiryTime`, `getExpiryTime`, `getExpiryTimeMilliseconds` are forwarded so callers need only import from this file.

## Relationships

- **`./config`** — source of secrets (`getAccessTokenSecret`, `getRefreshTokenSecret`), TTL helpers (`getAccessTokenTTL`, `getExpiryTime`, `getExpiryTimeMilliseconds`), and the `RefreshTokenExpiryTime` type. All policy lives there; this file only consumes it.
- **`@modules/users` (`src/modules/users/index.ts`)** — provides `userRepository` and `TokenType`. Methods used: `findByTokenValue`, `findByIdWithCredentials`, `tokenAdd`, `tokenTouch`. The user document is the store for issued refresh tokens.
- **`src/modules/users/repository.ts` / `model.ts`** — the concrete implementation behind those `userRepository` calls; token storage and the positional `tokenTouch` update live here.
- **Consumers** — `post-login.ts`, `services/authentication.ts`, and `module.ts` call into these exports as part of login, refresh, and session-listing flows. Unit and integration tests (`session-jwt.test.ts`, `jwt.test.ts`, `service-flows.test.ts`) exercise the functions directly.

## Notes

- **`jti` is load-bearing.** Without the random `jti`, two refresh tokens minted in the same second for the same user are byte-identical (payload is just `{ id }`, and `iat`/`exp` are second-resolution). A `jti` ensures each token is a unique credential, so revoking one doesn't revoke a sibling session.
- **`recordRefreshTokenUse` is fire-and-forget.** It swallows its own errors so a bookkeeping write can never turn a valid refresh into a 401.
- **Access-token verification is stateless; refresh-token verification is not.** Only `verifyRefreshToken` touches the database. `verifyAccessToken` is safe to call without a connection pool.
- **`createAccessToken` is not called during login.** Login mints the first access token inline; `createAccessToken` is the refresh-route path. `recordRefreshTokenUse` is likewise refresh-route-only — stamping at issue time would make the "last used" field meaningless.
