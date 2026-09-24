---
source: src/modules/account/tests/integration/jwt.test.ts
sha256: 082f52bb68173bb17330b19021d1724ab89675545f7b6eced496744b36b2157c
generated_at: 2026-09-23T18:13:21.418504+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/jwt.test.ts

## Purpose

Integration test suite for the JWT session lifecycle in `session/jwt.ts`. It exercises the full round-trip of access and refresh token creation, verification, and revocation against a real database, guarding the security-critical contract that access tokens are stateless (signature + expiry only) while refresh tokens are stateful (checked against the user document so that logout can actually end a session).

## Key elements

- **`signAs`** — helper that signs fixture tokens exactly as `jwt.ts` does, stamping `keyid: keyId(secret)` so the key-ring lookup resolves. Defaults `auth_time` and `amr` into the payload since `TokenData` requires both.
- **`beforeEach` / `afterEach` env block** — explicitly sets `NODE_TOKEN_ACCESS`, `NODE_TOKEN_REFRESH`, and two expiry keys, then restores them. Necessary because unit tests do not load dotenv; the SUT reads these from `process.env` at call time.
- **`describe('verifyAccessToken')`** — covers valid signature, wrong-secret rejection, expired token, malformed string, and payload tampering (forged base64url payload with original signature).
- **`describe('verifyRefreshToken')`** — covers valid + stored, orphan token (signature valid but not on any user → `Forbidden`), post-removal rejection, wrong-secret rejection, and expired-without-DB-hit.
- **`describe('createRefreshToken')`** — covers persistence on the user doc (verified via round-trip), correct `TokenType.REFRESH` storage with future expiry, unknown-user rejection, deactivated/soft-deleted rejection, and multi-device accumulation (two tokens both remain verifiable).
- **`describe('createAccessToken')`** — covers refresh→access exchange, refusal after revocation, and the `select: false` edge case where a document loaded without credentials still revokes via atomic `$pull`.
- **`setupTestDb()`** — called at module scope to ensure a real database connection for the whole suite.

## Relationships

- **`session/jwt.ts`** — the system under test; provides `verifyAccessToken`, `verifyRefreshToken`, `createRefreshToken`, `createAccessToken`, `rotateRefreshToken`, and `TokenReuseError`.
- **`session/key-ring.ts`** — `keyId()` is called by `signAs` to produce the `keyid` header value the verifier expects.
- **`session/config.ts`** — exports `RefreshTokenExpiryTime` enum used as the tier argument to `createRefreshToken`.
- **`services/index.ts`** — re-exports `runTokenCleanup`, imported here (exercised in the truncated rotation/cleanup section).
- **`services/token-cleanup.ts`** — implementation behind `runTokenCleanup`.
- **`users/index.ts`** — provides `TokenType` and `hashToken` used for storage assertions and token type checks.
- **`users/model.ts`** — user document methods `tokenAdd` and `tokenRemoveAll` drive the revocation scenarios.
- **`users/repository.ts`** — `findByIdWithCredentials` reloads the `select: false` tokens array for assertions and pre-revocation reads.
- **`users/tests/factories.ts`** — `createUser` builds test users; `userRepository` gives direct repo access for credential reloads.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` initialises the integration test database.
- **`tests/support/environment.ts`** — `withEnvironmentOverrides` (imported; likely used in the truncated section for env-dependent cases).

## Notes

- Tokens are stored **as hashes** (`hashToken(issued)`), never as plaintext. Assertions that inspect the stored row must hash the expected value before comparing.
- The `tokens` array on the user model is `select: false`. A plain `findById` returns `tokens === undefined`, not `[]`. Tests that need to inspect or pre-revoke tokens must use `findByIdWithCredentials`.
- `createRefreshToken` **accumulates** (pushes) into `tokens` rather than replacing the array — a regression to assignment would silently break multi-device sessions.
- Env teardown in `afterEach` distinguishes "key was originally unset" (deletes the key) from "key had a value" (restores it), preventing cross-test contamination.
- The `signAs` helper exists because `jwt.ts` internally stamps `keyid` from the secret; forgetting this in a hand-rolled fixture would cause the key-ring lookup to fail silently, producing a confusing "invalid signature" rather than a "wrong key" error.
