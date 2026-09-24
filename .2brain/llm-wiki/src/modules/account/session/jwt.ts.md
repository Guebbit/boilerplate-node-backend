---
source: src/modules/account/session/jwt.ts
sha256: d3137197ad3343ea8c767d78eb1166fcafc88d9c9875de149c0e333b45afdb72
generated_at: 2026-09-23T18:11:31.698318+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/jwt.ts

## Purpose

Mints, verifies, rotates, and revokes the application's access and refresh JWTs. All signing/verification logic lives here so that `authentication.ts` and `session.ts` can orchestrate login and refresh flows without touching `jsonwebtoken` directly. Secrets, TTLs, and key-ring membership are delegated to `./config` and `./key-ring`; token persistence is delegated to the `users` service.

## Key elements

- **`TokenData`** — the claims interface (`id`, `auth_time`, `amr`) shared by every access and refresh token. `auth_time` is stamped once at login and copied forward on every re-mint; it is never re-read from the clock.
- **`verifyAgainstRing`** (internal) — decodes the `kid` header, looks up the matching ring key via `keyForId`, then verifies with `jsonwebtoken` pinned to `HS256`. Rejects before signing verification if the `kid` names no current ring member.
- **`verifyAccessToken`** — stateless access-token check against the access ring.
- **`verifyRefreshToken`** — JWT check against the refresh ring **plus** a DB revocation lookup (`userService.findByTokenValue`). Rejects with `'Forbidden'` if the token is not on the user document.
- **`signAccessToken` / `signRefreshToken`** (internal) — sign with the ring's newest key, stamp `kid`, pin `HS256`. Refresh tokens additionally carry a `randomUUID()` `jti` to prevent byte-identical tokens minted within the same second.
- **`createRefreshToken`** — login path: loads the user via `findByIdWithCredentials`, guards with `isAuthenticatable`, signs a refresh token, and persists it via `userService.tokenAdd`.
- **`createAccessToken`** — exchange path: verifies the refresh token, copies `auth_time`/`amr` forward, signs a short-lived access token.
- **`recordRefreshTokenUse`** — stamps `lastUsedAt` for session-listing. Swallows errors so a bookkeeping failure never rejects a valid refresh.
- **`TokenReuseError`** — thrown when a refresh token is presented that the document no longer holds live. Carries `userId` so the caller can act without a second lookup.
- **`revokeAllRefreshTokens`** (internal) — removes every REFRESH token on the account; the reuse-detection response.
- **`reissueRotated`** (internal) — signs the post-rotation refresh (preserving the remaining absolute expiry, not a fresh TTL) plus a fresh access token, then persists and stamps usage.
- **`rotateRefreshToken`** (truncated in source) — public rotation entry point that calls `verifyRefreshToken`, detects reuse via the token's `jti`/value, then invokes `revokeAllRefreshTokens` + `reissueRotated` or throws `TokenReuseError`.
- **`isAuthenticatable`** (internal) — `active !== false && !deletedAt`; mirrors the `AUTHENTICATABLE_FILTER` in `users/repository.ts` for paths that bypass `findForLogin`.

## Relationships

- **`./config`** — source of all signing rings (`getAccessTokenRing`, `getRefreshTokenRing`), TTLs (`getExpiryTime`, `getExpiryTimeMilliseconds`), and rotation-grace window. This file never hard-codes a key or duration.
- **`./key-ring`** — provides `keyId` (derive the `kid` string from a secret) and `keyForId` (reverse-lookup a secret by `kid` within a ring). Called on every sign and every verify.
- **`@modules/users`** (`index.ts` → `service.ts`, `model.ts`) — `userService` is the persistence backend: `findByIdWithCredentials`, `tokenAdd`, `tokenRemoveAll`, `findByTokenValue`, `tokenTouch`. `UserDocument` types the user; `TokenType` and `hashToken` are used for the refresh-token column.
- **`src/modules/account/services/authentication.ts`** — the primary caller: invokes `createRefreshToken` at login and `rotateRefreshToken` on the refresh endpoint.
- **`src/modules/account/session/session.ts`** — session-listing and session-management logic that calls `verifyAccessToken` / `verifyRefreshToken` and relies on `recordRefreshTokenUse` timestamps.
- **`src/modules/account/module.ts`** — module manifest / barrel; declares the `account → users` dependency that this file exercises.
- **Tests** — `session-jwt.test.ts` (unit), `jwt.test.ts` and `service-flows.test.ts` (integration) exercise the signing, rotation, reuse-detection, and copy-forward invariants directly.

## Notes

- **`auth_time` is stamped exactly once, at `createRefreshToken`.** Every subsequent mint (`createAccessToken`, `reissueRotated`) copies the value forward from the token it replaces. Re-stamping from the clock on refresh is the single most common way the step-up freshness gate silently stops firing.
- **`jti` (`randomUUID`) is mandatory on refresh tokens.** Without it, two tokens minted within the same second for the same user are byte-identical, causing shared revocation. Access tokens do not need `jti` because they are stateless and short-lived.
- **Algorithm confusion is explicitly defended against.** Both sign and verify pin `HS256`; verify also checks `kid` before calling `jsonwebtoken.verify`, so a `kid` naming a retired key rejects early with a distinct error message.
- **`recordRefreshTokenUse` never rejects.** It `.catch(() => undefined)`. A valid refresh must not 401 because an audit-column write failed.
- **Rotation preserves absolute expiry.** `reissueRotated` receives `remainingMs` and signs the new refresh with that value, not a fresh full TTL. This keeps the session's total lifetime bounded regardless of how many times it rotates.
- **`isAuthenticatable` is a backstop, not the primary guard.** The primary filter is `findForLogin` in the users module; this check covers paths (OAuth linked-identity resolution, email fallback) that load the user by ID without that filter.
