# src/modules/account/tests/integration/jwt.test.ts

## Purpose

Integration tests for the four JWT functions exported by `@modules/account/session/jwt`. They verify the security-critical split between stateless access tokens (signature + expiry only) and stateful refresh tokens (signature **and** a database revocation lookup against the user document). Several tests exist specifically to guard against the refresh path silently dropping its DB lookup, which would make logout cosmetic and let stolen refresh tokens live out their full TTL.

## Key elements

- **`beforeEach` / `afterEach`** — Pin `NODE_TOKEN_ACCESS`, `NODE_TOKEN_REFRESH`, and the two expiry env vars to fixed test values, then restore the originals. Prevents silent dependence on a developer's `.env`.
- **`describe('verifyAccessToken')`** — Confirms valid access tokens resolve, and that cross-secret signing, expiry, malformed strings, and payload tampering all reject.
- **`describe('verifyRefreshToken')`** — Confirms a refresh token must be *both* correctly signed *and* present on the user document. Explicitly tests that a validly-signed orphan token is rejected (`Forbidden`), that revocation via `tokenRemoveAll` flips the result, and that an expired token is rejected before any DB hit.
- **`describe('createRefreshToken')`** — Round-trips an issued token through `verifyRefreshToken`; asserts storage under `TokenType.REFRESH` with a real future expiry; rejects unknown user IDs; and verifies **accumulation** (two consecutive calls yield two independently verifiable tokens, i.e. multi-device login).
- **`describe('createAccessToken')`** — Exercises the refresh→access exchange. Key sub-cases:
  - Revoked refresh token → no access token minted (`Forbidden`).
  - Revocation on a document whose `tokens` field was never loaded (`select: false`) must resolve *and* actually revoke — guards against a post-write `undefined.filter` crash that previously turned a successful logout into a 500.
  - Identity is carried from the refresh token, not caller-supplied.

## Relationships

- **`src/modules/account/session/jwt.ts`** — the module under test; all four exported functions are the subjects of every test block.
- **`src/modules/account/session/config.ts`** — supplies `RefreshTokenExpiryTime.SHORT` used when issuing tokens in the `createRefreshToken` tests.
- **`src/modules/users/index.ts`** — re-exports `TokenType` (used for `tokenAdd` / `tokenRemoveAll` calls) and `userRepository` (used to re-load documents with credentials and to load "bare" documents for the `select: false` edge case).
- **`src/modules/users/model.ts`** — the user document's `tokenAdd`, `tokenRemoveAll`, and the `tokens` field (declared `select: false`) are exercised directly; tests assert storage type, expiry, and the atomic-`$pull` revocation path.
- **`src/modules/users/repository.ts`** — `findByIdWithCredentials` is used to re-read the `tokens` array after mutations; `findById` is used to obtain a document *without* tokens, specifically to test the `undefined.filter` regression.
- **`src/modules/users/tests/factory.ts`** — `createUser` creates a fresh user per test, providing the identity that tokens are issued for.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module scope; the entire file requires a live database (MongoDB) because refresh-token verification and revocation hit the store.

## Notes

- **Database required.** Unlike unit tests, this file calls `setupTestDb()` and performs real queries. It will fail (or hang) in an environment without a reachable test database.
- **`tokens` is `select: false`.** Any assertion that reads back a stored token must go through `userRepository.findByIdWithCredentials`, not a plain `findById`. The dedicated "bare document" test relies on this exact asymmetry.
- **Env-var restoration is delete-or-assign.** The `afterEach` restores each key with `delete` when it was previously `undefined`, avoiding leakage of test secrets into later test suites.
- **The file is truncated in this snapshot.** The final `describe('createAccessToken')` test ("carries the identity…") is cut off mid-line; the full suite may contain additional cases.
