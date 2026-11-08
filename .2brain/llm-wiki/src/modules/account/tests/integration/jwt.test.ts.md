---
source: src/modules/account/tests/integration/jwt.test.ts
sha256: 4e444fc5cf8befae44c50cb2d91b9d59e9bef2d5d8fd101e4e6f22ae7ee1de7e
generated_at: 2026-11-08T04:37:41.660634+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/jwt.test.ts

## Purpose

Integration test suite for the JWT session module (`session/jwt.ts`). It exercises the full sign → store → verify → rotate → revoke lifecycle against a real test database, with emphasis on the security boundary between stateless access tokens and stateful refresh tokens (the latter are checked against session rows so that logout actually ends a session).

## Key elements

- **`signAs` (helper)** — Signs a fixture token the same way `jwt.ts` does in production: stamps `kid: keyId(secret)` in the protected header, sets the correct `typ` (`at+jwt` / `rt+jwt` per RFC 9068), issuer, audience, `jti`, and `auth_time`/`amr`. Used to craft tokens that the verifier will accept structurally so tests can isolate the DB-backed checks.
- **`beforeEach`** — Sets `NODE_TOKEN_ACCESS`, `NODE_TOKEN_REFRESH`, `NODE_TOKEN_ACCESS_TIME`, and `NODE_SESSION_TIME_SHORT` via `setEnvironment`, since unit/integration tests do not load `.env`.
- **`describe('token types (typ header)')`** — Verifies cross-type rejection (refresh presented as bearer and vice-versa), rejection of a token with no `typ`, and that the module stamps the correct RFC 9068 typ on issued tokens.
- **`describe('verifyRefreshToken after a rotation')`** — Confirms a rotated-away token is refused, that refusing it is *not* reuse detection (siblings still work), and that a rotation within the grace window still succeeds.
- **`describe('verifyRefreshToken')`** — Covers the stateful path: a validly-signed token with no session row is rejected ("Forbidden"); a row that is later removed causes a `revoked` error; an expired token is rejected before any DB hit.
- **`describe('startSession')`** — Validates that a verifiable refresh token is persisted as a digest row (mode `jwt`), that unknown/deactivated/soft-deleted users are rejected, and that multiple logins add rows (multi-device) rather than replacing.
- **`describe('createAccessToken')`** — *(truncated in source)* — Exercises the refresh → access exchange.

## Relationships

- **`src/modules/account/session/jwt.ts`** — The module under test. All exported functions (`verifyAccessToken`, `verifyRefreshToken`, `createAccessToken`, `rotateRefreshToken`, `startSession`, `rememberOfRefreshToken`, `TokenReuseError`, `FIRST_PARTY_CLIENT_ID`) are imported and exercised here.
- **`src/modules/account/session/config.ts`** — Provides `getTokenIssuer`, `getAccessTokenAudience`, `getRefreshTokenAudience`, `getExpiryTime`, `getExpiryTimeMilliseconds`; consumed by `signAs` to match production headers.
- **`src/modules/account/session/key-ring.ts`** — `keyId` is used to stamp the `kid` header on fixtures so the verifier's ring lookup succeeds.
- **`src/modules/account/repository.ts`** — `sessionRepository` is used directly to delete rows (simulating logout) and to set up/inspect session state.
- **`src/modules/account/tests/factories.ts`** — `plantSession`, `reapDueSessions`, `sessionRowFor`, `sessionRowsOf` provide DB-level fixtures and assertions.
- **`src/modules/users/tests/factories.ts`** — `createUser` factory; also re-exports `userRepository` (imported here).
- **`src/types/index.ts`** — `RememberTier` enum controls the session duration tier passed to `startSession`.
- **`tests/support/environment.ts`** — `setEnvironment` / `withEnvironmentOverrides` to inject secrets per-test without dotenv.
- **`tests/support/clock.ts`** — `freezeDate` / `advanceDate` for time-dependent assertions (expiry, grace windows).
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` provisions the in-test database at module load.

## Notes

- Secrets are hard-coded strings (`'test-access-secret'`, `'test-refresh-secret'`) and injected via `setEnvironment`, **not** read from `.env`. This is intentional: the test runner does not load dotenv, so any code path that falls back to `process.env` will see the values set here.
- Every fixture must carry `kid: keyId(secret)`; omitting it causes the key-ring lookup to fail and the test errors with a generic "invalid signature" rather than the intended assertion.
- The `typ` header is enforced independently of signature correctness — a token signed with the correct secret but wrong (or missing) `typ` is rejected as "Wrong token type" before the DB is consulted.
- Refresh-token verification is **stateful**: a cryptographically valid signature is necessary but not sufficient. The token must also exist as a live session row. This is what makes logout possible.
- The file is an **integration** test (uses `setupTestDb` + real repository calls), not a unit test; do not expect it to run without the test database infrastructure.
