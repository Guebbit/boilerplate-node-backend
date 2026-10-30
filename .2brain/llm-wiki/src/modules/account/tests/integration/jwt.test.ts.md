---
source: src/modules/account/tests/integration/jwt.test.ts
sha256: 4e444fc5cf8befae44c50cb2d91b9d59e9bef2d5d8fd101e4e6f22ae7ee1de7e
generated_at: 2026-10-29T02:56:31.462302+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/jwt.test.ts

## Purpose

Integration tests for the JWT session lifecycle (`session/jwt.ts`): access-token verification, refresh-token verification (including the stateful DB check that makes logout actually revoke), rotation semantics, session minting (`startSession`), and token-type enforcement. Because refresh-token security depends on a database row existing, these tests run against a real test database rather than in isolation.

## Key elements

- **`signAs(secret, payload, opts)`** – Local helper that mints a JWT exactly as `jwt.ts` does: correct `kid` from `keyId(secret)`, correct `typ` (`at+jwt` / `rt+jwt`), issuer, audience, `jti`, `auth_time`, and `amr`. Used to construct orphan or expired tokens without going through `startSession`.
- **`beforeEach`** – Sets `NODE_TOKEN_ACCESS`, `NODE_TOKEN_REFRESH`, `NODE_TOKEN_ACCESS_TIME`, and `NODE_SESSION_TIME_SHORT` via `setEnvironment`, so each test gets a clean, known secret pair.
- **`describe('token types (typ header)')`** – Verifies cross-type rejection (refresh-as-bearer, access-as-refresh, missing `typ`) and that `jwt.ts` stamps the correct RFC 9068 `typ`.
- **`describe('verifyRefreshToken after a rotation')`** – Confirms a rotated-away token is rejected *without* poisoning the family (sibling and the new token still verify), and that a second rotation within the grace window still succeeds.
- **`describe('verifyRefreshToken')`** – Covers the happy path (signed + stored), the revocation check (signed but no row → `Forbidden`), row removal as logout, and expiry-before-DB-lookup short-circuit.
- **`describe('startSession')`** – Validates that a session row is persisted as a digest with correct `mode`, `expiresAt`/`purgeAt`, `startedAt`; that unknown / deactivated / soft-deleted users are rejected; and that repeated logins add rows (multi-device) in separate families.
- **`describe('createAccessToken')`** – (truncated in source) Exercises the refresh → access exchange.

## Relationships

- **`src/modules/account/session/jwt.ts`** – The system under test. All `verify*`, `create*`, `rotate*`, `startSession`, and `TokenReuseError` imports come from here.
- **`src/modules/account/session/config.ts`** – Provides `getTokenIssuer`, `getAccessTokenAudience`, `getRefreshTokenAudience`, `getExpiryTime`, `getExpiryTimeMilliseconds`, which `signAs` uses to mint structurally correct fixtures.
- **`src/modules/account/session/key-ring.ts`** – `keyId(secret)` is used by `signAs` to stamp the correct `kid` header so the verifier's ring lookup matches.
- **`src/modules/account/repository.ts`** – `sessionRepository` is used directly to call `removeAll` (simulating logout) and is the storage layer the stateful refresh check queries.
- **`src/modules/account/tests/factories.ts`** – `plantSession`, `reapDueSessions`, `sessionRowFor`, `sessionRowsOf` provide direct DB inspection and seeding helpers.
- **`src/modules/users/repository.ts`** – (imported via factories) the user-existence check behind `startSession`'s "User not found" path.
- **`src/modules/users/tests/factories.ts`** – `createUser` and `userRepository` supply test users.
- **`src/types/index.ts`** – `RememberTier` enum used as the tier argument to `startSession`.
- **`tests/support/setup-test-db.ts`** – Called at module top-level (`setupTestDb()`) to boot the in-memory/test database before any suite runs.
- **`tests/support/environment.ts`** – `setEnvironment` / `withEnvironmentOverrides` give per-test isolation of env vars without mutating `process.env` globally.
- **`tests/support/clock.ts`** – `freezeDate` / `advanceDate` (imported, used in truncated portions) for deterministic time-dependent assertions.

## Notes

- **Secrets are set explicitly** in `beforeEach`, not via `.env`, because the test runner does not load dotenv.
- **`signAs` mirrors production signing exactly** (including `kid` derivation and `typ` selection). Deviating from this helper in a test would exercise the verifier's ring lookup differently and could mask or create false failures.
- **The shared-secret tests** (`NODE_TOKEN_ACCESS === NODE_TOKEN_REFRESH`) are deliberately adversarial: they prove that `typ` alone prevents cross-use even when the HMAC secret cannot distinguish the two rings.
- **Refresh-token revocation is DB-state-based**, not blacklist-based. The "orphan token" test exists to pin that a valid signature without a stored row is rejected—this is the invariant that makes logout meaningful.
- **`setupTestDb()` runs at module scope**, not inside a `beforeAll`, so it executes once when the file is imported. Tests depend on this ordering.
