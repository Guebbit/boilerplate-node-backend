# src/modules/account/tests/integration/jwt.test.ts

## Purpose

Integration test suite for the JWT module (`session/jwt.ts`). It verifies the security-critical contract between stateless access tokens and stateful refresh tokens: that refresh tokens require both a valid signature **and** a matching row on the user document, that logout (token removal) actually revokes sessions, and that the two secret types are never interchangeable.

## Key elements

- **`describe('verifyAccessToken')`** — Confirms payload resolution on a valid token, and rejection on: wrong secret (refresh secret), expired token, malformed string, and tampered payload (forged base64 segment).
- **`describe('verifyRefreshToken')`** — Confirms the two-part check: valid signature *and* stored-on-user. Rejects orphan tokens (valid sig, no row), revoked tokens (removed after a prior success check), wrong secret, and expired tokens.
- **`describe('createRefreshToken')`** — Round-trips a newly issued token through `verifyRefreshToken`; asserts the stored entry has `type: REFRESH` and a future expiry; rejects unknown user IDs; verifies multi-device accumulation (two tokens coexist rather than one replacing the other).
- **`describe('createAccessToken')`** — Exchanges a stored refresh token for a verifiable access token; refuses revoked, unsigned, or foreign tokens; pins the payload identity to the refresh token's owner (not caller-supplied); includes a "bare document" test guarding the `select: false` edge case.
- **Env-var harness** — `beforeEach`/`afterEach` save/restore `NODE_TOKEN_*` keys and set fixed test secrets so the suite never reads `.env`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `session/jwt.ts` | System under test; imports `verifyAccessToken`, `verifyRefreshToken`, `createRefreshToken`, `createAccessToken`. |
| `session/config.ts` | Imports `RefreshTokenExpiryTime` to parameterize `createRefreshToken` calls. |
| `users/index.ts` | Imports `TokenType` (enum) and `userRepository` (for `findByIdWithCredentials` / `findById`). |
| `users/model.ts` | Exerced indirectly via `user.tokenAdd` and `user.tokenRemoveAll` on user documents. |
| `users/repository.ts` | Exerced indirectly via `userRepository.findByIdWithCredentials` and `userRepository.findById`. |
| `users/tests/fixtures.ts` | `createUser` provides a fresh user document per test. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` initialises the test database before the suite runs. |

## Notes

- **Secrets are set explicitly** (not via dotenv) because the test runner does not load `.env`. The four `NODE_TOKEN_*` keys are saved and restored around each test to avoid leaking into sibling suites.
- **`tokens` is `select: false`** on the user schema. Reading it requires `findByIdWithCredentials`; a plain `findById` leaves `tokens === undefined`. The "bare document" test in `createAccessToken` specifically guards a past bug where `tokenRemoveAll` succeeded in the DB (`$pull`) but then threw on `undefined.filter(...)`, turning a successful logout into a 500.
- **Multi-device guard**: the `createRefreshToken` suite asserts that two successive issuances *both* survive and are independently verifiable, preventing a future regression to a `tokens = [newToken]` assignment.
- **Dual-assertion revocation tests**: both `tokenRemoveAll` resolving *and* the subsequent `createAccessToken` rejecting are asserted together, because either half alone is satisfiable by incorrect code (e.g., a no-op revocation, or a revocation that throws after the write).
