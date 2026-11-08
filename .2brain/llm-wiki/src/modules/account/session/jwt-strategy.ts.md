---
source: src/modules/account/session/jwt-strategy.ts
sha256: be874b2fc9ccac2b576fd57907bbe6881e2fff7155f0ce86df995024ae8b1e08
generated_at: 2026-11-08T04:28:40.904494+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/jwt-strategy.ts

## Purpose

Adapter that implements the `SessionStrategy` port for the **jwt** session mode. It wraps the raw token operations in `./jwt.ts` (signing, rotation, reuse detection) behind the `SessionStrategy` interface so upstream code never sees tokens directly. It covers the full lifecycle: minting a session, resolving access/refresh credentials, retiring replaced sessions and families, and wiring SSE stream liveness checks.

## Key elements

- **`jwtStrategy`** (exported) — the `SessionStrategy` object with `mode: 'jwt'`; wires all the helpers below into the port's contract (resolve, watch, mint, retire, list, etc.).
- **`mintSession`** — orchestrates a session mint: calls `startSession` or `continueSession`, sets the refresh cookie, returns the access token and the refresh token.
- **`cookieMaxAgeOf`** — computes the refresh-cookie `maxAge` from the remember tier and, when continuing, the remaining life of the prior session.
- **`retireRefreshToken`** / **`retireRestOfFamily`** / **`retirePresentedSession`** — delete replaced session rows (single row, whole family, or family-on-sign-in). All log-and-swallow failures; a leftover row just expires on its own schedule.
- **`snapshotOf`** / **`sessionRowOf`** — capture the current session's tier, family, and timestamps *before* a change ends it. `sessionRowOf` falls back to the bearer's `sid` family when no refresh cookie is present (`followBearer`), preventing a second family from being started.
- **`resolveWith`** — generic adapter that turns a `verify` function into the kernel's `Resolution` shape (`{ ok }` vs `{ miss }`).
- **`resolveBearer`** — verifies the access token **and** confirms the named session family is still live via `resolveInLiveFamily`.
- **`watchRefreshCookie`** — resolves a refresh cookie for SSE streams; the recheck closure follows the token's *family* (not the token itself) so a stream survives the next rotation.
- **`unlessOtherMode`** — short-circuits `ses_…`-format IDs (the other mode's credential) to a `{ miss: 'revoked' }` instead of a signature failure, distinguishing stale from forged.

## Relationships

- **`./jwt.ts`** — source of all core token operations: `startSession`, `continueSession`, `createAccessToken`, `verifyAccessToken`, `verifyRefreshToken`, `verifyRefreshWithRow`, `rememberOfRefreshToken`, `TokenRejection`, `TokenData`.
- **`./strategy.ts`** — defines the `SessionStrategy` interface and shared types (`IssuedSession`, `SessionRequest`, `SessionSnapshot`) that this file implements/uses.
- **`./cookies.ts`** — provides `createSessionCookie` for setting the HttpOnly refresh cookie.
- **`./config.ts`** — provides `getCookieMaxAgeMilliseconds` for tier-based cookie lifetimes.
- **`./auth-context.ts`** — provides `resolveProof` to build an `AuthContext` from claims.
- **`./family-liveness.ts`** — provides `resolveInLiveFamily`, used by `resolveBearer` and `watchRefreshCookie` to confirm the session family is still alive.
- **`./session-id.ts`** — provides `looksLikeSessionId` for the `unlessOtherMode` guard.
- **`./listing.ts`** — provides `listSessions` (wired into the strategy's list endpoint).
- **`../repository.ts`** — `sessionRepository` for all row lookups, insertions, and deletions; `SessionRow` type.
- **`@kernel/cookies`** — `bearerOf` and `readSessionCookie` for extracting credentials from the request.
- **`@kernel/authentication`** — `Resolution` and `StreamWatch` types that shape the strategy's return values.
- **`@infrastructure/adapters/logger`** — `logger.warn` on non-fatal retirement failures.
- **`@infrastructure/security/hash-token`** — `hashToken` applied before every DB lookup so tokens are never stored or compared in plaintext.
- **Tests:** `src/modules/account/tests/unit/jwt-strategy.test.ts` (unit tests for this file) and `session-strategy.test.ts` (shared strategy-contract tests).

## Notes

- **Retirement is best-effort.** `retireRefreshToken`, `retireRestOfFamily`, and `retirePresentedSession` all `.catch` and `logger.warn` rather than throwing. The new session already exists; a stale row will expire on its own.
- **`followBearer` is opt-in.** A factor change that kills all sessions (e.g. password change) passes `false`, so the bearer token the request arrived with dies with the rest. A simple re-mint passes `true` so a client sending only its access token doesn't orphan its family.
- **SSE recheck is passive.** `watchRefreshCookie` passes `{ passive: true }` to `resolveInLiveFamily`, signalling that the stream's liveness probe is not the end-user performing an action.
- **`unlessOtherMode` ordering.** This guard is applied *before* the real resolver, so a `ses_…` ID never reaches the JWT verifier and is reported as `revoked` (stale credential count) rather than a signature failure (security event).
- **Cookie max-age on continuation.** When `continueSession` is used, the new cookie's `maxAge` is set to the *remaining* life of the replaced session (clamped to ≥ 1 s), not the tier's full duration.
