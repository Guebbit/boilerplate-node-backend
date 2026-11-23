---
source: src/modules/account/tests/unit/session-jwt.test.ts
source_sha256: 6c0a6ffc93ac66f8187dbbe9e2147ec0fa58d8194d05a4ce62577b80f14a29f7
context_sha256: 3084ef04dc9439664d882856423cc7a8c1cd038f99a88ec222b73679572a9971
generated_at: 2026-11-22T04:08:38.373874+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/unit/session-jwt.test.ts

## Purpose
Unit tests for the token layer in `src/modules/account/session/jwt.ts`. They assert the safety properties of that layer: the access and refresh secrets never cross-verify, a refresh token is valid only while its session row is still stored, `jti: randomUUID()` keeps same-second logins from revoking each other, and the signing key ring can rotate without a mass logout. The session store and the users service are mocked. Query behavior is covered separately by `src/modules/account/tests/integration/auth-storage.test.ts` against a real store.

## Key elements
- **`jest.mock('@modules/users/friends/account')`**: spreads the real module and replaces only `accountUserService.findAuthenticatableById` and `touchLastActive` with `jest.fn()`.
- **`jest.mock('@modules/account/repository')`**: spreads the real module and replaces only `sessionRepository.findByHash` and `insert`.
- **`USER_ID`**: the single user id used by every case.
- **`mockedUsers` / `mockedSessions`**: `asStub` views of the two mocked services, typed to the mocked members.
- **`signedInUser()`**: the minimal authenticatable-user shape (`id`, `tokensValidAfter`, `twoFactorEnabledAt`).
- **`holdingLive()`**: makes `findByHash` return a live `jwt`-mode session row for any digest, and makes the user lookup succeed. This is what `verifyRefreshToken` reads.
- **`mintable()`**: stubs the user lookup, `touchLastActive` and `insert` so `startSession` can run.
- **`signAs(secret, payload, opts)`**: the fixture signer. It builds an HS256 JWT with `kid: keyId(secret)`, a random `jti`, and default `auth_time` and `amr`.
  - It picks `typ` (`rt+jwt` for the refresh secret, `at+jwt` otherwise), plus `iss`/`aud` and `client_id` (access tokens only) per ring.
  - Options let a case override `expiresIn` and `typ`, or override or omit `issuer` and `audience` (`null` leaves the claim out).
- **`accessWith({issuer, audience})`**: signs an access token that differs only in those registered claims.
- **`beforeEach`**: calls `jest.resetAllMocks()` and sets the environment variables `NODE_TOKEN_ACCESS`, `NODE_TOKEN_REFRESH`, `NODE_TOKEN_ACCESS_TIME`, `NODE_SESSION_TIME_SHORT` and `NODE_SESSION_TIME_LONG`.
- **`describe('verifyAccessToken')`** cases:
  - valid payload resolves;
  - a token with no `sid` is rejected as `malformed`;
  - a refresh-secret token is rejected as `invalid_signature`;
  - refusals are classified as `expired`, `invalid_signature` (including "Unknown signing key" for a retired key) and `malformed`;
  - a token with no expiry is rejected;
  - a token missing `auth_time` or `amr` is rejected as `Wrong claims`;
  - `alg: none` forgeries are rejected, both without a `kid` and with a real `kid`.

## Relationships
- **`src/modules/account/session/jwt.ts`**: the code under test. The tests import `verifyAccessToken`, `verifyRefreshToken`, `createAccessToken`, `startSession` and `FIRST_PARTY_CLIENT_ID` from it.
- **`src/modules/account/session/key-ring.ts`**: `keyId(secret)` stamps the `kid` header on fixtures.
- **`src/modules/account/session/config.ts`**: `getTokenIssuer`, `getAccessTokenAudience` and `getRefreshTokenAudience` supply the default `iss` and `aud` claims.
- **`src/modules/account/repository.ts`**: `sessionRepository` is partially mocked.
- **`src/modules/users/friends/account.ts`**: `accountUserService` is partially mocked.
- **`src/infrastructure/security/hash-token.ts`**: `hashToken` is imported for the refresh-token and session-row assertions.
- **`tests/support/environment.ts`**: `setEnvironment` sets the token secrets and lifetimes.
- **`tests/support/stub.ts`**: `asStub` types the mocks.

## Notes
- Every fixture must carry a `kid`. `kid` is how a ring member is found, so a fixture without one verifies against nothing.
- `beforeEach` uses `resetAllMocks`, not `clearAllMocks`. `clearAllMocks` leaves a previous case's implementations in place, so a rejection from one test would leak into the next and fail it with the wrong error.
- The `alg: none` test with a real `kid` is the one that exercises the `algorithms: ['HS256']` pin, because `verifyAgainstRing` resolves the secret from `kid` before it calls `verify`.
- The `signAs` helper treats `secret === 'refresh-secret'` as the refresh ring, so the secret names used in `beforeEach` matter.
