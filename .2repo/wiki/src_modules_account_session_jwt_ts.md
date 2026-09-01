# src/modules/account/session/jwt.ts

## Purpose

Owns all JWT issuance and verification for the `account` domain: minting access and refresh tokens, verifying them, and persisting refresh tokens on the user document. Policy (secrets, TTLs, expiry tiers) is delegated to `./config`; this file is purely the sign/verify/persist mechanics.

## Key elements

- **`TokenData`** — interface for the JWT payload; contains only `id: string`.
- **`verifyAccessToken(token)`** — stateless `jsonwebtoken.verify` against the access-secret. No DB call.
- **`verifyRefreshToken(token)`** — JWT verify against the refresh-secret, then a `userRepository.findByTokenValue(token)` revocation check. Rejects with `'Forbidden'` if the token isn't on the user document.
- **`createRefreshToken(id, remember?)`** — loads the user via `findByIdWithCredentials`, signs a refresh JWT (HS256, `jwtid: randomUUID()`), and persists it with `user.tokenAdd(TokenType.REFRESH, …)`. Returns the updated user document.
- **`recordRefreshTokenUse(refreshToken)`** — stamps the token as "used" via `userRepository.tokenTouch` so the sessions endpoint can show idle devices. Swallows all errors (resolves to `undefined`) so a bookkeeping write failure never 401s a valid refresh.
- **`createAccessToken(refreshToken)`** — calls `verifyRefreshToken`, then signs a short-lived access JWT using `getAccessTokenTTL()`.

## Relationships

- **`./config` (`src/modules/account/session/config.ts`)** — single source for secrets, TTLs, and expiry-time helpers. This file imports every policy value from there and owns no key material itself.
- **`@modules/users` (`src/modules/users/index.ts`)** — imports `userRepository` and the `TokenType` enum. All DB reads/writes for refresh tokens (find, add, touch) go through the users module's repository and model methods.
- **`src/modules/account/services/authentication.ts` / `controllers/post-login.ts`** — downstream consumers that call these exports (e.g., `createAccessToken`, `verifyRefreshToken`) during the login and token-refresh flows.
- **Tests** — `tests/unit/session-jwt.test.ts` exercises individual exports; `tests/integration/jwt.test.ts` and `service-flows.test.ts` exercise them through the full request/response path.

## Notes

- **`jwtid` / `jti` is load-bearing.** Without it, two refresh tokens signed in the same second for the same user are byte-identical, so revoking one silently revokes the other (a phone logout would log out a simultaneously active laptop). The `jti` claim makes each token addressable; `verify` does **not** check it—only the DB lookup on `tokens.token` does.
- **`recordRefreshTokenUse` never throws.** It catches and discards all errors. This is intentional: the refresh exchange must succeed even if the "last-used" timestamp write fails. Do not add a re-throw.
- **`recordRefreshTokenUse` is called only from the refresh route**, never from `createAccessToken` at initial login. Stamping at issue time would make every new session look "just used" and defeat the idle-detection purpose.
- **`findByIdWithCredentials`** is used (not plain `findById`) because `tokenAdd` needs the credentials subdocument to push onto.
- Access-token TTL is passed in **seconds** (`getAccessTokenTTL()`), matching `jsonwebtoken`'s `expiresIn` unit. Don't switch to milliseconds here.
