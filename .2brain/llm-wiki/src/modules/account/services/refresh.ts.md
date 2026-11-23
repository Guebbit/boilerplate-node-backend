---
source: src/modules/account/services/refresh.ts
source_sha256: f7a1473e3409b4b70019acaa51ee5d54b8b285c859ebc5bab0139be0e3ee43d0
context_sha256: 6a9760adacde2d758a7fda9e629ed81cdaeaadda7a9d9e9ff4b3d79a28bd9e25
generated_at: 2026-11-22T03:41:25.112472+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/services/refresh.ts

## Purpose
Implements the refresh-token exchange: given a refresh cookie (possibly absent), it obtains a rotated session from `../session/jwt` and records an audit entry for every outcome. It decides and records all outcomes in one place: success, missing token, invalid token, and reuse of an already-rotated token.

## Key elements
- `refreshAccessToken(refreshToken, context)`: the sole export. It takes `string | undefined` plus a `CallerContext` and returns `Promise<RotatedSession>`: new access/refresh tokens and the refresh cookie's new `maxAge`, for the controller to set. It calls `rotateRefreshToken` if a token is present, otherwise rejects with `MissingRefreshTokenError`.
  - On success it audits `AUTH_TOKEN_REFRESHED` with outcome `success`.
  - On failure it audits with outcome `failure`, then rethrows the original error.
- `MissingRefreshTokenError` (module-private): represents the absent cookie so a single `catch` can distinguish it from other failures.
- `failureReason(error)` (module-private): maps a failure to the audit `metadata.reason`: `missing_token`, `session_idle` (a `TokenRejection` with reason `idle`), or `invalid_token` (anything else).

## Relationships
- `../session/jwt`: provides `rotateRefreshToken`, `TokenReuseError`, `TokenRejection` and the `RotatedSession` type. The rotation logic lives there, not here.
- `@infrastructure/observability/audit`: `recordAudit(context, {...})` writes the audit rows.
- `../audit`: supplies `accountAuditActions` (`AUTH_TOKEN_REFRESHED`, `AUTH_REFRESH_TOKEN_REUSE_DETECTED`).
- `../metrics`: `authRefreshReuseTotal` counter, incremented on reuse detection.
- `@types` (`src/types`): supplies the `CallerContext` type. `src/types/index.ts` is the neighbor in the graph for this import.

## Notes
- Reuse is handled separately from ordinary failures. It uses its own audit action, increments `authRefreshReuseTotal`, and carries no `metadata.reason`. It sets `actorUserId` to `error.userId`, since the account is known.
- Other failures set `actorUserId: 'anonymous'` and include `metadata.reason`. `actorRole` is deliberately left at its default (`anonymous`), because no verified access token accompanied the request.
- Errors are always rethrown after auditing, so callers still handle failures. The audit is recorded as a side effect, not a replacement for error handling.
