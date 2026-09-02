# src/modules/account/session/jwt.ts

## Purpose

JWT creation and verification for the `account` domain. All signing, verification, rotation, and revocation logic for access tokens, refresh tokens, and MFA challenge tokens lives here. Secrets and TTL policy are delegated to `./config`; token persistence is delegated to `@modules/users`.

## Key elements

- **`TokenData`** — interface for the claims carried in every access/refresh JWT. Wire names follow OIDC (`auth_time`, `amr`). `purpose: 'mfa'` is exclusive to challenge tokens and must never appear on access/refresh tokens.
- **`verifyAccessToken(token)`** — stateless `jsonwebtoken.verify` (HS256, access secret). No DB call.
- **`verifyRefreshToken(token)`** — JWT check plus `userRepository.findByTokenValue` revocation lookup. Rejects with `'Forbidden'` if the token is absent from the user document.
- **`createRefreshToken(id, remember?, amr?)`** — signs a refresh token (stamping `auth_time` and `amr` at login time) and persists it via `user.tokenAdd`. Uses `randomUUID()` as `jti` to guarantee uniqueness.
- **`createAccessToken(refreshToken)`** — verifies the refresh token, then signs a short-lived access token, copying `auth_time`/`amr` from the refresh claims (never re-stamping the clock).
- **`createMfaChallenge(id)`** — signs a 300-second challenge token with the *access* secret and `purpose: 'mfa'`.
- **`verifyMfaChallenge(token)`** — wraps `verifyAccessToken` and asserts `purpose === 'mfa'`.
- **`recordRefreshTokenUse(refreshToken)`** — best-effort `tokenTouch` write; swallows all errors so a valid refresh never 401s due to bookkeeping.
- **`TokenReuseError`** — thrown when a presented refresh token is not in the user's live set outside the grace window. Carries `userId` so the caller can act without a second lookup.
- **`reissueRotated`** (module-private) — signs the post-rotation refresh token (same absolute expiry as the old one, fresh `jti`) and the accompanying access token; stamps `lastUsedAt` immediately.
- **`MFA_CHALLENGE_TTL_SECONDS`** — exported constant (300).

## Relationships

- **`./config`** — sole source of secrets (`getAccessTokenSecret`, `getRefreshTokenSecret`), TTLs (`getAccessTokenTTL`, `getExpiryTime`, `getExpiryTimeMilliseconds`), and `getRotationGraceMilliseconds`. This file contains no hard-coded secrets or durations.
- **`@modules/users` (repository / model)** — `userRepository` provides `findByTokenValue`, `findByIdWithCredentials`, `tokenAdd`, `tokenRemoveAll`, `tokenTouch`; the model exposes `TokenType` and `hashToken`. All persistence side-effects flow through this dependency.
- **`session/session.ts`** — orchestrates session lifecycle calls into this file (issuing refresh tokens, recording use, listing sessions).
- **`services/authentication.ts`** — calls `verifyAccessToken`, `createAccessToken`, and the rotation path during the login/refresh flow.
- **`services/two-factor.ts`** — calls `createMfaChallenge` / `verifyMfaChallenge` for the step-up 2FA handshake.
- **`module.ts`** — its `resolve()` guard is the single choke-point that rejects any token carrying `purpose: 'mfa'` before it reaches an access-token guard.
- **`controllers/post-login.ts`** — entry point that triggers `createRefreshToken` and `createAccessToken` after successful credential (or 2FA) validation.
- **Tests** — `unit/session-jwt.test.ts` exercises the sign/verify/rotation logic in isolation; `integration/jwt.test.ts` and `integration/service-flows.test.ts` cover the full HTTP + persistence path.

## Notes

- **`auth_time` is stamped exactly once** (in `createRefreshToken`) and then only *copied forward* on every rotation and access-token mint. Stamping the clock anywhere else silently disables the step-up freshness gate while all other tests pass.
- **`purpose: 'mfa'` safety** relies entirely on `account/module.ts`'s `resolve()` rejecting it. The challenge token is signed with the same access secret; without that check it would verify as a normal access token and bypass 2FA.
- **`jti` (via `randomUUID()`)** is mandatory on refresh tokens. Without it, two tokens minted in the same second are byte-identical, causing cross-device revocation (logging out one device kills the other).
- **`recordRefreshTokenUse` is intentionally fire-and-forget.** A failed bookkeeping write must not invalidate a valid refresh exchange.
- All `verify` calls pin `algorithms: ['HS256']` to prevent algorithm-confusion attacks (`alg: none`, asymmetric swap).
- `createAccessToken` is called both at login (first access token) and on every refresh. `recordRefreshTokenUse` is deliberately *not* called inside `createAccessToken` to avoid marking every session "just now" at issuance.
