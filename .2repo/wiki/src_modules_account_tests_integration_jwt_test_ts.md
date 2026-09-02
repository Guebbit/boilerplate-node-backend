# src/modules/account/tests/integration/jwt.test.ts

## Purpose

Integration tests for the JWT session module (`session/jwt.ts`). Validates the four public functions—`createAccessToken`, `verifyAccessToken`, `createRefreshToken`, `verifyRefreshToken`—against a real database, exercising the security-critical split between stateless access tokens and stateful (DB-backed) refresh tokens, including revocation, secret separation, expiry, tamper resistance, and multi-device accumulation.

## Key elements

- **`describe('verifyAccessToken')`** — Asserts that tokens signed with the access secret resolve; rejects tokens signed with the refresh secret, expired tokens, malformed strings, and forged payloads.
- **`describe('verifyRefreshToken')`** — Asserts the two-part check: valid signature *and* presence on the user document. Rejects orphan tokens, revoked tokens, cross-secret tokens, and expired tokens.
- **`describe('createRefreshToken')`** — Round-trips a newly issued token through `verifyRefreshToken`; verifies the stored row under `TokenType.REFRESH` with a future expiry; rejects unknown user IDs; confirms tokens accumulate (multi-device) rather than replace.
- **`describe('createAccessToken')`** — Exchanges a valid stored refresh token for a verifiable access token; refuses revoked, unsigned, or foreign tokens; pins the identity to the refresh token's owner.
- **Env-var save/restore in `beforeEach`/`afterEach`** — Explicitly sets `NODE_TOKEN_ACCESS`, `NODE_TOKEN_REFRESH`, and expiry tiers to fixed test values, then restores the original environment afterward.
- **`setupTestDb()`** — Top-level call that provisions a real test database for the suite.

## Relationships

- **`src/modules/account/session/jwt.ts`** — The module under test; all four exported functions are exercised here.
- **`src/modules/account/session/config.ts`** — Supplies `RefreshTokenExpiryTime.SHORT` used as the tier argument to `createRefreshToken`.
- **`src/modules/users/index.ts`** — Re-exports `TokenType`, `userRepository`, and `hashToken` consumed throughout the tests.
- **`src/modules/users/model.ts`** — Provides `tokenAdd`, `tokenRemoveAll`, and `findByIdWithCredentials` on the user document; the `tokens` array (marked `select: false`) is the stateful store these tests validate against.
- **`src/modules/users/repository.ts`** — `userRepository.findById` and `findByIdWithCredentials` are used to inspect or revoke stored token rows.
- **`src/modules/users/tests/fixtures.ts`** — `createUser` creates the user documents every test case operates on.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` initialises the MongoDB instance the integration suite runs against.

## Notes

- Secrets are hard-coded to `'test-access-secret'` / `'test-refresh-secret'` and injected via `process.env` in `beforeEach` because the test runner does not load `.env`. The env-var save/restore pattern ensures no leakage between suites.
- The `tokens` field is `select: false`, so `findById` returns a document where `tokens` is `undefined` (not `[]`). One test deliberately exercises `tokenRemoveAll` on such a bare document to guard against a historical bug where the in-memory resync called `.filter` on `undefined` *after* the atomic `$pull` write had already succeeded.
- Stored tokens are compared via `hashToken(issued)` (a digest), never by the raw JWT string—consistent with the wave 3.1 migration.
- The revocation tests assert both the negative case (token no longer verifiable) and the positive precondition (it *was* verifiable before revocation) to avoid vacuous passes.
