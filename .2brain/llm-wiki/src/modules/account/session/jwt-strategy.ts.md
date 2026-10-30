---
source: src/modules/account/session/jwt-strategy.ts
sha256: be874b2fc9ccac2b576fd57907bbe6881e2fff7155f0ce86df995024ae8b1e08
generated_at: 2026-10-29T02:49:01.522113+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/jwt-strategy.ts

## Purpose

Implements the `jwt` session strategy: a short-lived (10-minute) access token held client-side plus a rotating refresh token in an HttpOnly cookie, one `sessions` row per refresh token. This file is the adapter that places the token primitives from `./jwt.ts` behind the `SessionStrategy` port, so callers never see raw tokens.

## Key elements

- **`jwtStrategy`** (exported) — The concrete `SessionStrategy` implementation for `mode: 'jwt'`. Exposes `resolveBearer`, `resolveCookie`, `watchRefreshCookie`, `list`, `reissue`, and `revoke` via the port's shape.
- **`mintSession`** — Orchestrates a new or re-minted session: calls `startSession`/`continueSession`, sets the refresh cookie via `createSessionCookie`, and returns the access token in the body.
- **`cookieMaxAgeOf`** — Computes cookie lifetime: uses the `RememberTier` default for fresh sessions, or the remaining TTL of the continued session.
- **`retireRefreshToken` / `retireRestOfFamily` / `retirePresentedSession`** — Best-effort deletions of replaced session rows after re-mint, re-proof, or sign-in. Failures are logged, not thrown.
- **`snapshotOf`** — Reads the caller's current session metadata (tier, family, start, expiry) *before* a destructive change, so a re-mint can continue rather than restart.
- **`sessionRowOf`** — Resolves which row a change continues: refresh cookie's row first, then (if `followBearer`) the newest live row of the bearer's family. Prevents a bearer-only reauth from spawning a second family.
- **`resolveWith` / `resolveBearer`** — Wraps `verifyAccessToken` into the port's `Resolution` shape; a `TokenRejection` becomes `{ miss }`, infra errors still reject. `resolveBearer` additionally checks family liveness.
- **`watchRefreshCookie`** — Resolves a refresh token for SSE stream connections; the recheck closure tracks the token's *family* so the stream survives the next rotation.
- **`unlessOtherMode`** — HIGHS a `ses_…` id (the other strategy's credential) as `{ miss: 'revoked' }` rather than letting it hit the JWT verifier and register as a security event.

## Relationships

- **`./jwt.ts`** — Source of all token primitives: `startSession`, `continueSession`, `createAccessToken`, `verifyAccessToken`, `verifyRefreshWithRow`, `rememberOfRefreshToken`, `TokenRejection`. This file orchestrates them but performs no crypto itself.
- **`./strategy.ts`** — Provides the `SessionStrategy`, `IssuedSession`, `SessionRequest`, `SessionSnapshot` types that define the contract this file fulfills.
- **`./cookies.ts`** — `createSessionCookie` writes the refresh + logged-in cookies on the Express response.
- **`./config.ts`** — `getCookieMaxAgeMilliseconds` supplies the tier-based default TTL.
- **`./auth-context.ts`** — `resolveProof` builds the `AuthContext` (AMR proofs, auth time) returned to callers.
- **`./family-liveness.ts`** — `resolveInLiveFamily` guards that the session family is still alive before granting access or re-checking an SSE stream.
- **`./session-id.ts`** — `looksLikeSessionId` lets `unlessOtherMode` short-circuit foreign credentials.
- **`./listing.ts`** — `listSessions` powers the strategy's `list` method.
- **`../repository.ts`** — `sessionRepository` performs all row lookups and deletions (by hash, family, etc.).
- **`@kernel/cookies`** — `bearerOf` / `readSessionCookie` extract credentials from the incoming request.
- **`@kernel/authentication.ts`** — Provides `Resolution` and `StreamWatch` result types.
- **`@infrastructure/security/hash-token.ts`** — `hashToken` is applied before every repository query or removal.
- **`@infrastructure/adapters/logger.ts`** — Structured warning logs in the retirement helpers.
- **`tests/unit/jwt-strategy.test.ts`** — Unit tests for this adapter.
- **`tests/unit/session-strategy.test.ts`** — Strategy-level tests that exercise this file through the port.

## Notes

- All retirement helpers (`retireRefreshToken`, `retireRestOfFamily`, `retirePresentedSession`) catch and log rather than throw: the new session already exists, so a leftover old row simply expires on its own schedule.
- `snapshotOf` must run **before** the destructive operation (e.g. password change) that deletes the row; ordering matters.
- The `followBearer` flag in `sessionRowOf` is intentionally *not* passed by changes that invalidate all sessions (factor changes): those tokens must die with the rest.
- SSE stream rechecks use `{ passive: true }` in `resolveInLiveFamily` to signal the liveness probe is not a user action.
- The strategy is stateless at the adapter level; all persistence lives in `sessionRepository` and the token logic in `./jwt.ts`.
