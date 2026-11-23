---
source: src/modules/account/session/jwt-strategy.ts
source_sha256: 50a43247f5c86d3df09db01e083410327894fde9661e0384e6b2cc34f32c485e
context_sha256: 75be308a0c7c5b83a9963cce4403ad36331f9bd5add022ee0a201fc15530ec9d
generated_at: 2026-11-22T03:47:13.166362+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/session/jwt-strategy.ts

## Purpose
Implements the `jwt` session mode as a `SessionStrategy` adapter. A short-lived (10-minute) access JWT is held in client memory, and a rotating refresh token lives in an HttpOnly cookie, with one `sessions` row per refresh token. Signing, rotation and reuse detection live in `./jwt.ts`. This file wraps them so code above the strategy interface doesn't know tokens are involved.

## Key elements
- **`jwtStrategy`** (exported, `SessionStrategy`, `mode: 'jwt'`): the adapter object. Its body is truncated in the source shown here, so only the module-level helpers are documented below. One visible comment says the refresh cookie opens the two SSE streams and nothing else.
- **`mintSession`**: calls a `mint` function (`startSession` or `continueSession`), sets the refresh cookie via `createSessionCookie`, then exchanges the refresh token for an access token. Returns `{ issued: { token }, refreshToken }`.
- **`cookieMaxAgeOf`**: cookie lifetime. For a remembered, continued session it is the time left on the old session (minimum 1s). Otherwise it uses `getCookieMaxAgeMilliseconds(remember)`. `undefined` gives a browser-session cookie.
- **`retireRefreshToken`**: deletes the row of the replaced refresh token by hash. Failures are logged, not raised.
- **`retireRestOfFamily`**: after a re-proof, removes every row of the family except the new successor. Failures are logged, not raised.
- **`retirePresentedSession`**: on a new sign-in over a live session, removes the whole presented family. Failures are logged, not raised.
- **`snapshotOf`**: reads the current session's tier, family, start and expiry (`SessionSnapshot`), so a re-mint continues the session instead of starting a new one. It must run before the change that ends the session.
- **`sessionRowOf`**: finds the row a change continues. It uses the refresh cookie's row. If there is no cookie and `followBearer` is set, it falls back to the newest live row of the family named by the access token's `sid`. An access token that fails verification yields `undefined`.
- **`resolveWith`**: turns a token verifier into a resolver returning `Resolution<AuthContext | undefined>`. A `TokenRejection` becomes `{ miss: reason }`. Any other error is rethrown so an outage stays distinguishable from a bad token.
- **`resolveBearer`**: verifies the access token, then checks via `resolveInLiveFamily` that the `sid` family is still alive before resolving proof.
- **`watchRefreshCookie`**: verifies the refresh token for SSE streams. It returns a `StreamWatch` whose `recheck` follows the token's family, not the token itself, so the stream survives rotation. The recheck runs with `passive: true`.
- **`unlessOtherMode`**: wrapper that returns `{ miss: 'revoked' }` for tokens that look like a `ses_…` session id.

## Relationships
- **`src/modules/account/session/jwt.ts`**: token and session primitives (`startSession`, `continueSession`, `createAccessToken`, `verifyAccessToken`, `verifyRefreshToken`, `verifyRefreshWithRow`, `rememberOfRefreshToken`, `TokenRejection`, `TokenData`).
- **`src/modules/account/repository.ts`**: `sessionRepository` (`removeByHash`, `removeFamilyExcept`, `removeFamilyByHash`, `findByHash`, `findLiveFamilyRow`) and the `SessionRow` type.
- **`src/modules/account/session/strategy.ts`**: supplies the `SessionStrategy`, `SessionRequest`, `SessionSnapshot` and `IssuedSession` types.
- **`src/modules/account/session/family-liveness.ts`**: `resolveInLiveFamily` does the family-alive check for bearer and stream rechecks.
- **`src/modules/account/session/auth-context.ts`**: `resolveProof` builds the `AuthContext` from `sub`, `auth_time` and `amr`.
- **`src/modules/account/session/cookies.ts`** and **`src/modules/account/session/config.ts`**: `createSessionCookie` sets the refresh cookie, and `getCookieMaxAgeMilliseconds` gives the cookie lifetime.
- **`src/modules/account/session/session-id.ts`**: `looksLikeSessionId` detects the other mode's credential.
- **`src/modules/account/session/listing.ts`**: imports `listSessions`. Its use is in the truncated part of the file.
- **`src/kernel/cookies.ts`**: `bearerOf` and `readSessionCookie` read credentials from the request.
- **`src/kernel/authentication.ts`**: supplies the `Resolution` and `StreamWatch` types.
- **`src/infrastructure/security/hash-token.ts`**: `hashToken` hashes tokens for lookup and deletion, so rows are matched by hash.
- **`src/infrastructure/adapters/logger.ts`**: logs the swallowed cleanup failures.
- **Tests**: `src/modules/account/tests/unit/jwt-strategy.test.ts` and `src/modules/account/tests/unit/session-strategy.test.ts`.

## Notes
- Cleanup of replaced sessions is best-effort. The new session is already stored, so a failed delete is logged and the old one expires on its own schedule.
- Stale `ses_…` ids are reported as `revoked` (a stale-credential count) rather than a signature failure (a security event).
- `followBearer` is deliberately off for changes that end every session, such as a factor change, so the presented access token dies with the rest.
- Resolvers separate `{ miss }` (bad token) from thrown errors (infrastructure outage).
