---
source: src/modules/account/session/jwt.ts
sha256: 58ea63ddb0827b3bef7197ecf887aaadcef1b101b4680bc8efe8ced970d1f48f
generated_at: 2026-09-27T14:32:21.534623+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/jwt.ts

## Purpose

Mints and verifies the application's access and refresh JWTs (HS256, `kid`-indexed key rings). It owns the token lifecycle: creating refresh tokens at login, exchanging refresh tokens for short-lived access tokens, rotating refresh tokens, detecting reuse, and verifying either token type. Policy (secrets, TTLs, grace windows) is delegated to `./config`; key lookup is delegated to `./key-ring`.

## Key elements

- **`TokenData`** (exported interface) — The claims shape every access/refresh JWT carries: `id`, `auth_time` (epoch seconds, stamped once at login and copied forward on every reissue), `amr` (RFC 8176 auth-method array).
- **`verifyAccessToken(token)`** — Stateless ring verification against the access-token ring.
- **`verifyRefreshToken(token)`** — Ring verification **plus** a DB lookup via `userService.findByTokenValue`; throws `'Forbidden'` if the token isn't stored on the user document.
- **`createRefreshToken(id, remember?, amr?)`** — Loads the user (with credentials), signs a refresh token (with a `jti` UUID for uniqueness), and persists it via `userService.tokenAdd`.
- **`createAccessToken(refreshToken)`** — Verifies the refresh token, then signs a new access token, **copying** `auth_time`/`amr` from the refresh token (never re-stamps the clock).
- **`recordRefreshTokenUse(refreshToken)`** — Fire-and-forget `tokenTouch` write for session UI bookkeeping; resolves even on failure.
- **`TokenReuseError`** (exported class) — Thrown when a refresh token is presented that is unknown or superseded outside the grace window; carries `userId`.
- **`reissueRotated`** (internal) — The "winning half" of a rotation: signs a new refresh token with the *remaining* TTL, persists it, and returns both the new access and refresh tokens.
- **`verifyAgainstRing`** (internal) — Decodes the `kid` header, resolves the matching secret from the ring, then calls `jsonwebtoken.verify` with `algorithms: ['HS256']` pinned.
- **`signAccessToken` / `signRefreshToken`** (internal) — Wrap `jsonwebtoken.sign`; the refresh variant adds a `jti` UUID.
- **`revokeAllRefreshTokens`** (internal) — Removes every refresh token on the user document; the reuse-detection response.
- **`isAuthenticatable`** (internal) — Guards minting paths: `active !== false && !deletedAt`.

## Relationships

- **`./config`** — Source of all signing rings (`getAccessTokenRing`, `getRefreshTokenRing`), TTL lookups (`getExpiryTime`, `getExpiryTimeMilliseconds`), and the rotation-grace window. This file never hard-codes a secret or a duration.
- **`./key-ring`** — Supplies `keyId` (for stamping `kid` headers) and `keyForId` (for resolving the secret during verification).
- **`@modules/users` (`userService`, `TokenType`, `hashToken`, `UserDocument`)** — Persistent store for refresh tokens. `jwt.ts` calls `findByIdWithCredentials`, `findByTokenValue`, `tokenAdd`, `tokenTouch`, and `tokenRemoveAll`. The manifest declares this as the account→users dependency.
- **`./session.ts` / `./resolver.ts`** — Upstream callers that invoke the exported create/verify functions and the rotation/reuse logic.
- **`../services/authentication.ts`** — Orchestrates login flows that end by calling `createRefreshToken` and `createAccessToken`.
- **`src/modules/payments/providers/webhook-signature.ts`** — Shares the HS256 + `kid`-ring pattern; both modules pin `algorithms: ['HS256']` and resolve secrets via a key ring.
- **Tests** — `tests/unit/session-jwt.test.ts`, `tests/integration/jwt.test.ts`, and `tests/integration/service-flows.test.ts` exercise the exports above.

## Notes

- **`auth_time` is stamped exactly once** (at `createRefreshToken`) and then *copied forward* on every `createAccessToken` and `reissueRotated` call. Re-stamping it from `Date.now()` on rotation is the single most likely regression: the step-up freshness gate silently stops firing because the token always appears "fresh."
- **`jti` (UUID) on refresh tokens** exists because `iat`/`exp` are second-resolution; without it, two tokens minted in the same second are byte-identical, and revoking one revokes both.
- **`algorithms: ['HS256']`** is explicitly pinned in every `verify` call to prevent JWT algorithm-confusion attacks (`alg: none`, RS256→HS256 confusion).
- **`verifyAgainstRing` rejects unknown `kid` values before calling `jsonwebtoken.verify`**, so a retired key produces a distinct "Unknown signing key" error rather than a generic signature mismatch.
- **`recordRefreshTokenUse` never throws** — it swallows errors because a valid refresh exchange must not 401 due to a bookkeeping write failure.
- **`isAuthenticatable` mirrors `AUTHENTICATABLE_FILTER`** from the users repository; it guards minting paths that bypass `findForLogin` (e.g., OAuth linked-identity resolution).
