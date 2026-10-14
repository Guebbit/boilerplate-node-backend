---
source: src/modules/account/session/jwt-strategy.ts
sha256: 38d6db31b9ce443960a4b4d8dbc022d641ab64f4da77e9b4ac3e399247c272a6
generated_at: 2026-10-14T14:39:00.292383+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/jwt-strategy.ts

## Purpose

Adapter that implements the `SessionStrategy` interface in `jwt` mode: a short-lived (10-minute) access JWT held in client memory plus a rotating refresh token in an HttpOnly cookie, backed by one `sessions` row per refresh token. All signing, rotation, and reuse-detection logic lives in `./jwt.ts`; this file only wires those primitives behind the strategy port so callers above never see raw tokens.

## Key elements

- **`jwtStrategy`** (exported) — the single `SessionStrategy` object. Declares `mode: 'jwt'`, `cookieAuthenticates: false` (only SSE streams authenticate via the refresh cookie; every other route uses the bearer access token), and provides `issue`, `snapshot`, `reissue`, `remint`, `resolveBearer`, `resolveCookie`, `credentialOf`, and `list`.
- **`mintSession`** (private) — mints a refresh token, sets session + logged-in cookies, exchanges the refresh token for an access token, and returns both. Shared by `issue` and `reissue`.
- **`cookieMaxAgeOf`** (private) — computes cookie lifetime: for a continued session it uses the remaining TTL of the replaced row; otherwise the tier's configured max-age.
- **`retireRefreshToken` / `retireRestOfFamily` / `retirePresentedSession`** (private) — delete stale session rows after a re-mint, re-proof, or sign-in-over-existing-session. All are fire-and-forget: failures are logged at `warn` level, never thrown, because the new session already exists.
- **`snapshotOf`** (private) — reads the current refresh cookie, resolves its `remember` tier, and (if a live row exists for the same user) captures `familyId`, `startedAt`, `expiresAt` so a re-mint can *continue* rather than restart.
- **`resolveWith`** (private) — generic factory: wraps any token-verify function into the `Resolution<AuthContext | undefined>` shape. `TokenRejection` → `{ miss }`; other errors re-throw (outage vs. bad-token distinction).
- **`resolveBearer`** (private) — the access-token resolver. After `verifyAccessToken`, also checks `sessionRepository.familyIsLive` so a revoked session invalidates its still-unexpired access tokens immediately.

## Relationships

| Neighbor | Interaction |
|---|---|
| `./jwt.ts` | Imports every token primitive (`startSession`, `continueSession`, `createAccessToken`, `verifyAccessToken`, `verifyRefreshToken`, `rememberOfRefreshToken`, `TokenRejection`, `TokenData`). This file is the sole consumer of those internals. |
| `./strategy.ts` | Imports the `SessionStrategy` interface and its types (`IssuedSession`, `SessionRequest`, `SessionSnapshot`); `jwtStrategy` is the concrete implementation returned. |
| `./cookies.ts` | Calls `createSessionCookie` / `createLoggedCookie` to set response cookies during mint. |
| `@kernel/cookies.ts` | Calls `readSessionCookie` to extract the refresh-token cookie from inbound requests. |
| `../repository.ts` | Uses `sessionRepository` for all `sessions`-row CRUD (`findByHash`, `removeByHash`, `removeFamilyExcept`, `removeFamilyByHash`, `familyIsLive`). |
| `./auth-context.ts` | Calls `resolveProof` to turn raw claims into a typed `AuthContext`. |
| `./config.ts` | Reads `getCookieMaxAgeMilliseconds` and the `RefreshTokenExpiryTime` type for tier-based cookie lifetimes. |
| `./listing.ts` | Delegates `listSessions` to the strategy's `list` method. |
| `@infrastructure/security/hash-token.ts` | Hashes refresh tokens before any repository lookup or removal (tokens are never stored or compared in plaintext). |
| `@infrastructure/adapters/logger.ts` | Logs `warn` on non-critical failures (retire operations, remint failure). |
| `@kernel/authentication.ts` | Imports the `Resolution` discriminated-union type used by `resolveBearer` / `resolveCookie`. |
| `@types` (`auth-context.ts`, `index.ts`) | `AuthContext` type in resolver return shapes. |
| `…/jwt-strategy.test.ts` | Unit tests exercising the adapter's public surface. |
| `…/session-strategy.test.ts` | Integration-level tests that run `jwtStrategy` alongside the strategy contract. |

## Notes

- **`cookieAuthenticates: false`** is intentional and load-bearing: the only routes that read the refresh cookie for auth are the two SSE streams. Every other route must present the access token as `Authorization: Bearer …`. Code that assumes "cookie present ⇒ authenticated" will break in this mode.
- **Retire operations are best-effort by design.** `retireRefreshToken`, `retireRestOfFamily`, and `retirePresentedSession` all swallow errors to a `logger.warn`. A leftover row simply expires on its own schedule; the new session is already active. Do not "fix" this by re-throwing.
- **`snapshotOf` reads the row *before* any operation that may delete it** (e.g. a password change). Callers must not mutate the session row between reading the snapshot and passing it to `mintSession`.
- **`remint` is the one method that returns `void`-ish on failure.** It logs a warning if the re-mint fails after the underlying session change succeeded, so the caller does not need to handle an error.
- **`resolveBearer` adds a liveness check** (`familyIsLive`) on top of signature verification. This means a session can be revoked and its still-valid-by-expiry access tokens rejected immediately. `resolveCookie` (refresh-token path) does *not* perform this extra check.
