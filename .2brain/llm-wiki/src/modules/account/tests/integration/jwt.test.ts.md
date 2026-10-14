---
source: src/modules/account/tests/integration/jwt.test.ts
sha256: bec0b1385422dc92d49c90e715fdc7d4a211bedc195b5280d3c896c37778f444
generated_at: 2026-10-14T14:40:32.565100+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/jwt.test.ts

## Purpose

Integration test suite for the JWT session layer (`session/jwt.ts`). It exercises token creation, verification, type enforcement, rotation, and revocation against a real test database, verifying the security-critical invariant that access tokens are stateless while refresh tokens are stateful (tied to a session row that logout can delete).

## Key elements

- **`signAs(secret, payload, opts)`** — Local helper that signs a fixture token the same way `jwt.ts` does: stamps `kid: keyId(secret)`, sets `auth_time`/`amr` defaults, and assigns `typ` per RFC 9068 (`at+jwt` / `rt+jwt`) unless overridden.
- **`describe('verifyAccessToken')`** — Verifies payload resolution, cross-secret rejection, expiry, malformed input, and payload-tamper rejection.
- **`describe('token types (`typ` header)')`** — Confirms the two token types are not interchangeable even when both rings share a secret, rejects tokens with no `typ`, and asserts the correct RFC 9068 type is stamped on issued tokens.
- **`describe('verifyRefreshToken after a rotation')`** — Validates that a rotated-away token is rejected *without* triggering reuse detection (sibling sessions survive) and that re-rotation within the grace window still succeeds.
- **`describe('verifyRefreshToken')`** — Covers the stateful path: signature + stored-row requirement, revocation via `sessionRepository.removeAll`, wrong-secret rejection, and short-circuit on expiry.
- **`describe('startSession')`** — Round-trips a freshly issued refresh token through the verifier, inspects the persisted session row (digest storage, `mode: 'jwt'`, `expiresAt`/`purgeAt`/`startedAt`), and rejects unknown user IDs.

## Relationships

- **`session/jwt.ts`** — Module under test; all `describe` blocks call its exports (`verifyAccessToken`, `verifyRefreshToken`, `createAccessToken`, `rotateRefreshToken`, `startSession`, `TokenReuseError`).
- **`session/key-ring.ts`** — Provides `keyId()` to compute the `kid` stamped on every fixture token, mirroring production behavior.
- **`session/config.ts`** — Supplies `RefreshTokenExpiryTime`, `getExpiryTime`, `getExpiryTimeMilliseconds` for tier-based expiry assertions.
- **`account/repository.ts`** — `sessionRepository.removeAll()` is the mechanism by which revocation tests delete the session row.
- **`account/tests/factories.ts`** — `plantSession`, `sessionRowFor`, `sessionRowsOf`, `reapDueSessions` create and inspect session rows directly.
- **`users/tests/factories.ts`** — `createUser()` provisions the user identity every test needs.
- **`tests/support/setup-test-db.ts`** — Boots a real test database so stateful assertions (stored rows, digests, expiry columns) are meaningful.
- **`tests/support/environment.ts`** — `setEnvironment` / `withEnvironmentOverrides` inject token secrets and time windows without dotenv.
- **`tests/support/clock.ts`** — `freezeDate` / `advanceDate` control wall-clock for expiry and grace-window scenarios.

## Notes

- Secrets are set explicitly via `setEnvironment` in `beforeEach` rather than inherited from `.env`, because the test runner does not load dotenv.
- The `typ` header is load-bearing: the suite deliberately tests that a token is rejected with `"Wrong token type"` even when the signing secret is valid for the *other* ring, so a shared secret cannot mask a type confusion.
- The rotation grace-window test (two `startSession` calls for the same user) encodes a specific product behavior: re-using a rotated token within the window is *not* reuse detection — only a third use (or use after the window) is.
- `signAs` defaults `auth_time` and `amr` because `TokenData` in `jwt.ts` requires both; test payloads only override when the case is specifically about one of those claims.
