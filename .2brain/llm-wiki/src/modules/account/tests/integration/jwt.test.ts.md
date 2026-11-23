---
source: src/modules/account/tests/integration/jwt.test.ts
source_sha256: 3d651a789f65abcb32be5886e0e8cc9a9b5e99fd3bfde2a51dd809966b87afa7
context_sha256: e5af6b70ed0511bdcf517a6355c80d26a23db95c5b6d5afddaf82ced0f47ad49
generated_at: 2026-11-22T03:56:11.386234+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/integration/jwt.test.ts

## Purpose
Integration tests for JWT session logic in `src/modules/account/session/jwt.ts`. They cover the security distinction between token types: access tokens are stateless (signature and expiry only), while refresh tokens are stateful and checked against their session row, so removing the row (logout) ends the session. The file sets secrets explicitly instead of relying on `.env`, because unit tests don't load dotenv.

## Key elements
- `setupTestDb()`: called at module level to provide the test database.
- `ACCESS_SECRET` / `REFRESH_SECRET`: the signing keys for the two token rings in this file.
- `signAs(secret, payload, { expiresIn, typ })`: builds a fixture JWT the way `jwt.ts` does. It stamps `kid: keyId(secret)`, the issuer and audience for the ring, a random token id, and the iat/exp times. It defaults `auth_time` and `amr`, adds `client_id: FIRST_PARTY_CLIENT_ID` for access tokens only, and uses `typ` `rt+jwt` or `at+jwt` unless overridden.
- `beforeEach`: sets `NODE_TOKEN_ACCESS`, `NODE_TOKEN_REFRESH`, `NODE_TOKEN_ACCESS_TIME` (900) and `NODE_SESSION_TIME_SHORT` (3600) through `setEnvironment`.
- `describe('token types (typ header)')`:
  - Refuses a refresh token presented as a bearer, even when both rings share a secret.
  - Refuses an access token presented as a refresh token.
  - Refuses a token with no `typ`.
  - Checks that real tokens carry `rt+jwt` and `at+jwt`.
- `describe('verifyRefreshToken after a rotation')`:
  - A rotated-away token fails with `Forbidden`.
  - Refusing it does not revoke the sibling session or the new token.
  - `rotateRefreshToken` still works on the old token inside the grace window.
- `describe('verifyRefreshToken')`:
  - Accepts a token that is signed and stored as a live session.
  - Rejects a validly signed token with no stored session (`Forbidden`).
  - Rejects with `reason: 'revoked'` after `sessionRepository.removeAll`.
  - Rejects an expired token.
- `describe('startSession')`:
  - Persists a verifiable refresh token.
  - Stores a `jwt`-mode row as a digest, with `expiresAt`, `purgeAt` and `startedAt`.
  - Rejects with `User not found` for an unknown, deactivated or soft-deleted user (`it.each`).
  - Adds a row per login, so multi-device login works.
  - The file is cut off partway through this block; its other cases are not documented here.

## Relationships
- `src/modules/account/session/jwt.ts`: the system under test. The file imports `verifyAccessToken`, `verifyRefreshToken`, `createAccessToken`, `rotateRefreshToken`, `rememberOfRefreshToken`, `TokenReuseError`, `startSession` and `FIRST_PARTY_CLIENT_ID`.
- `src/modules/account/session/config.ts`: supplies the issuer, audience and expiry helpers that `signAs` uses so fixtures match real tokens.
- `src/modules/account/session/key-ring.ts`: `keyId` derives the `kid` header, which a verifier uses to find the ring member.
- `src/modules/account/repository.ts`: `sessionRepository` (imported as `../../repository`), used to remove a user's session rows with `removeAll`.
- `src/modules/account/tests/factories.ts`: `plantSession`, `reapDueSessions`, `sessionRowFor` and `sessionRowsOf`, for seeding and inspecting session rows.
- `src/modules/users/tests/factories.ts`: `createUser` and `userRepository`. `src/modules/users/repository.ts` is a neighbor, though this file reaches it through the factories.
- `src/types/index.ts`: `RememberTier`.
- `tests/support/*`:
  - `setup-test-db`: database lifecycle.
  - `environment`: `setEnvironment` and `withEnvironmentOverrides`.
  - `clock`: `advanceDate` and `freezeDate`.

## Notes
- The tests assert that a valid signature alone is not enough for a refresh token. A matching session row is also required.
- Several tests deliberately set both secrets to `shared-secret`. This shows that the `typ` header, not the key, is what separates access tokens from refresh tokens.
- The revocation test first asserts that verification succeeds, so the later rejection cannot pass vacuously.
- Some imports (`TokenReuseError`, `rememberOfRefreshToken`, `advanceDate`, `freezeDate`, `reapDueSessions`, `userRepository`, `decodeJwt`) are not used in the visible portion. They are presumably used in the part of the file that is cut off.
