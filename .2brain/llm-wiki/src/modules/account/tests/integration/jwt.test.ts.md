---
source: src/modules/account/tests/integration/jwt.test.ts
sha256: a6ee55df5a170d80f3303306147756bc2c25ae5f0ab3cfb6117689db80d2d990
generated_at: 2026-10-15T10:12:08.701864+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/jwt.test.ts

## Purpose

Integration test suite for the JWT session layer (`session/jwt.ts`). It exercises the full create → verify → rotate → revoke lifecycle against a real database, with particular focus on the security boundary between stateless access tokens and stateful refresh tokens, RFC 9068 `typ` enforcement, and multi-device session isolation.

## Key elements

- **`signAs(secret, payload, opts)`** – Local helper that mints a fixture token the same way production `jwt.ts` does: stamps `kid` via `keyId(secret)`, sets `auth_time`/`amr`, and applies the correct `typ` (`at+jwt` / `rt+jwt`). Accepts `expiresIn` and `typ` overrides for edge-case tests.
- **`beforeEach`** – Sets `NODE_TOKEN_ACCESS`, `NODE_TOKEN_REFRESH`, and timing env vars explicitly (bypassing `.env`, which test runners don't load).
- **`describe('token types (typ header)')`** – Verifies cross-type rejection (refresh-as-access, access-as-refresh, missing `typ`) even when both rings share the same secret, and confirms the module stamps RFC 9068 types.
- **`describe('verifyRefreshToken after a rotation')`** – Confirms a rotated-away token is refused *without* revoking the family, and that a second rotation within the grace window still succeeds.
- **`describe('verifyRefreshToken')`** – Core acceptance/rejection matrix: signed + stored → ok; signed but orphaned → rejected (revocation check); row removed → `reason: 'revoked'`; wrong secret → rejected; expired → rejected without a DB hit.
- **`describe('startSession')`** – Verifies round-trip verifiability, session-row shape (digest, `expiresAt`, `purgeAt`, `startedAt`), rejection of unknown/deactivated/soft-deleted users, and add-per-login semantics (multi-device).

## Relationships

| Neighbor | Interaction |
|---|---|
| `session/jwt.ts` | System under test — imports `verifyAccessToken`, `verifyRefreshToken`, `createAccessToken`, `rotateRefreshToken`, `startSession`, `TokenReuseError`, `FIRST_PARTY_CLIENT_ID`. |
| `session/config.ts` | Imports config getters (`getTokenIssuer`, `getExpiryTime`, audience helpers, `RefreshTokenExpiryTime`) used in fixture signing and assertions. |
| `session/key-ring.ts` | Imports `keyId` to stamp the correct `kid` in every test fixture, matching production behavior. |
| `account/repository.ts` | Imports `sessionRepository` to perform revocation (`removeAll`) and inspect stored rows. |
| `account/tests/factories.ts` | Imports `plantSession`, `sessionRowFor`, `sessionRowsOf`, `reapDueSessions` for direct DB seeding and assertions. |
| `users/tests/factories.ts` | Imports `createUser` and `userRepository` to create fixture user identities. |
| `tests/support/environment.ts` | `setEnvironment` / `withEnvironmentOverrides` for per-test secret injection. |
| `tests/support/clock.ts` | `freezeDate` / `advanceDate` for time-sensitive expiry assertions. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` called at module scope to provision the integration database. |

## Notes

- **No dotenv.** All secrets are set programmatically in `beforeEach`; the file intentionally does not rely on `.env` or process-level env, so it runs identically in CI and locally.
- **Fixture fidelity.** `signAs` replicates the exact header shape (`alg`, `typ`, `kid`) and claim set (`auth_time`, `amr`, `client_id`, `jti`) that `jwt.ts` produces. If the production signer changes its contract, fixtures here will break first.
- **`typ` default logic.** The helper derives `typ` from which secret is used (access vs. refresh) unless the caller explicitly overrides it — this mirrors the RFC 9068 split and is the mechanism the "wrong type" tests depend on.
- **Real DB, real crypto.** This is an integration suite (Mongo-backed via `setupTestDb`), not a unit test; no JWT functions are mocked. Timing assertions use `clock.ts` helpers rather than `jest.useFakeTimers`.
- **Multi-device invariant.** The `startSession` tests explicitly assert that a second login *adds* a row rather than replacing the first, guarding against a regression that would silently sign out other devices.
