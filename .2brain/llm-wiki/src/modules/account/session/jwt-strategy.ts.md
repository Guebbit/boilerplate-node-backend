---
source: src/modules/account/session/jwt-strategy.ts
sha256: 49926c5581fdaa1e7fe68d0b5f2804ff25a852ee91ec9bb0a856634489abccab
generated_at: 2026-10-15T10:07:21.234993+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/jwt-strategy.ts

## Purpose

Adapter that implements the `SessionStrategy` port for the **JWT session mode**: a short-lived (≈10 min) access token the client keeps in memory, backed by a rotating refresh token in an HttpOnly cookie with one `sessions` row per refresh token. All signing, rotation, and reuse-detection logic lives in `./jwt.ts`; this file only wires that logic into the strategy interface so callers above never see tokens.

## Key elements

- **`jwtStrategy`** (exported) — the concrete `SessionStrategy` for mode `'jwt'`. Sets `cookieAuthenticates: false` (the refresh cookie only opens SSE streams; every other route authenticates via the bearer access token).
- **`mintSession`** — shared internal: mints a refresh token (via `startSession` or `continueSession`), sets the session cookie on the response, and exchanges the refresh token for an access token.
- **`cookieMaxAgeOf`** — resolves the cookie TTL: the continued session's remaining lifetime when re-minting, otherwise the tier's configured duration; `undefined` → browser-session cookie.
- **`retireRefreshToken` / `retireRestOfFamily` / `retirePresentedSession`** — best-effort cleanup of replaced or superseded session rows. Failures are logged via `logger.warn`, never thrown, because the new session already exists.
- **`snapshotOf`** — reads the current session's tier, family id, start/expiry *before* any mutation that could delete the row; returns a `SessionSnapshot` used by re-mint to continue rather than restart.
- **`resolveBearer`** — verifies the access token **and** checks the named session family is still alive (`resolveInLiveFamily`). `TokenRejection` → `{ miss }`; other errors re-throw.
- **`watchRefreshCookie`** — verifies the refresh token, then returns a `StreamWatch` whose `recheck` follows the token's **family** (not the individual token) so an SSE stream outlives a single rotation. Rechecks are marked `{ passive: true }`.
- **`unlessOtherMode`** — guard: if the presented credential looks like a `ses_…` id (the other mode), returns `{ miss: 'revoked' }` instead of treating it as a signature failure.
- **`resolveWith`** — generic helper that maps a `verify` function into the `Resolution` shape used by the authentication port.

## Relationships

- **`./jwt.ts`** — source of all token primitives (`startSession`, `continueSession`, `createAccessToken`, `verifyAccessToken`, `verifyRefreshToken`, `verifyRefreshWithRow`, `rememberOfRefreshToken`, `TokenRejection`, `TokenData`). This file never signs or rotates tokens itself.
- **`./strategy.ts`** — provides the `SessionStrategy` interface and the shared types (`IssuedSession`, `SessionRequest`, `SessionSnapshot`) that `jwtStrategy` implements.
- **`./family-liveness.ts`** — `resolveInLiveFamily` is called by `resolveBearer` and `watchRefreshCookie` to ensure the session family hasn't been revoked.
- **`./auth-context.ts`** — `resolveProof` turns raw JWT claims (`sub`, `auth_time`, `amr`) into an `AuthContext`.
- **`./cookies.ts`** — `createSessionCookie` writes the refresh-token cookie onto the response.
- **`./config.ts`** — `getCookieMaxAgeMilliseconds` and the `RefreshTokenExpiryTime` tier type drive cookie TTL.
- **`../repository.ts`** — `sessionRepository` is the persistence target for all retire/find operations.
- **`./session-id.ts`** — `looksLikeSessionId` lets `unlessOtherMode` detect cross-mode credentials.
- **`@infrastructure/security/hash-token.ts`** — `hashToken` is applied to every refresh token before it hits the repository (never stored in plaintext).
- **`@infrastructure/adapters/logger.ts`** — `logger.warn` for non-fatal retire failures.
- **`@kernel/cookies.ts`** — `readSessionCookie` extracts the refresh cookie from incoming requests.
- **`@kernel/authentication.ts`** — provides `Resolution` and `StreamWatch` types used as return shapes.
- **`src/modules/account/tests/unit/jwt-strategy.test.ts`** — unit tests for this adapter.
- **`src/modules/account/tests/unit/session-strategy.test.ts`** — cross-mode strategy tests that exercise `jwtStrategy` alongside the other mode.

## Notes

- **Retire functions are fire-and-forget.** A failure to delete a replaced row is logged, not raised. A leftover row will expire on its own schedule; the new session is already live.
- **`snapshotOf` reads the row *before* the mutation that ends it.** A password change, for example, deletes the row; reading first preserves the family/expiry data needed to continue the session.
- **SSE rechecks are `passive: true`.** A stream's periodic liveness check must not be treated as user activity (e.g., for idle-timeout resets).
- **`unlessOtherMode` classifies cross-mode credentials as `revoked`, not as a security event.** A `ses_…` id in a JWT-mode request is a stale browser artifact, not a forgery attempt.
- **`cookieAuthenticates` is `false`.** The only routes that accept the refresh cookie directly are the two SSE endpoints; all other authentication flows go through the bearer access token.
