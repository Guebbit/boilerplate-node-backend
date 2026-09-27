---
source: src/modules/account/tests/integration/jwt.test.ts
sha256: 89c451d099213a7633c7c493563112dc62eb7683e4b631f782c335f470baaa9a
generated_at: 2026-09-27T14:34:43.966560+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/jwt.test.ts

## Purpose

Integration tests for the JWT session lifecycle (`session/jwt.ts`): token creation, verification, rotation, and revocation. Exercises the real database and real user documents to verify the security-critical contract that access tokens are stateless (signature + expiry only) while refresh tokens are stateful (must exist on the user document), and that revocation (removing the token row) genuinely ends a session.

## Key elements

- **`signAs(secret, payload, options)`** — local helper that signs a JWT the same way `jwt.ts` does, stamping `keyid: keyId(secret)` so the key-ring lookup resolves correctly. Injects `auth_time` and `amr` defaults required by the `TokenData` shape.
- **`verifyAccessToken` suite** — happy path, cross-secret rejection, expiry, malformed input, and payload-tamper detection.
- **`verifyRefreshToken` suite** — signature + DB-presence check; revocation via `tokenRemoveAll`; cross-secret rejection; expiry short-circuits before any DB hit.
- **`createRefreshToken` suite** — persistence under `TokenType.REFRESH` with a real expiry; rejection for unknown, deactivated, or soft-deleted users; multi-device accumulation (push, not replace).
- **`createAccessToken` suite** — mint from a stored refresh token; refusal after revocation; behavior when the in-memory document never loaded its `select:false` tokens.
- **`runTokenCleanup`** (imported from `services/index.ts`) — available for cleanup-related assertions.
- **`TokenReuseError`** (imported from `session/jwt.ts`) — expected for rotation/replay scenarios.
- **`beforeEach` / `afterEach`** — pins four `NODE_TOKEN_*` env vars to explicit test secrets and restores originals, since the test environment does not load `.env`.

## Relationships

- **`src/modules/account/session/jwt.ts`** — the module under test; all five exported functions and `TokenReuseError` are imported directly.
- **`src/modules/account/session/key-ring.ts`** — `keyId()` is used by `signAs` to stamp the correct `kid` header, mirroring production signing.
- **`src/modules/account/session/config.ts`** — `RefreshTokenExpiryTime` tiers drive the expiry values passed to `createRefreshToken`.
- **`src/modules/users/tests/factories.ts`** — `createUser` builds test fixtures; re-exports `userRepository` for credential-aware reads.
- **`src/modules/users/model.ts`** — `tokenAdd` / `tokenRemoveAll` are the revocation surface exercised by refresh-token tests.
- **`src/modules/users/repository.ts`** — `findByIdWithCredentials` is used to re-read the `select:false` `tokens` array after writes.
- **`src/modules/users/index.ts`** — provides `TokenType` enum and `hashToken` helper.
- **`src/modules/account/services/index.ts`** — exports `runTokenCleanup` for cleanup-path tests.
- **`tests/support/setup-test-db.ts`** — called once at module top to provision the integration database.
- **`tests/support/clock.ts`** — `freezeDate` / `advanceDate` available for time-sensitive assertions.
- **`tests/support/environment.ts`** — `withEnvironmentOverrides` imported (utility for scoped env changes, though this file manages env vars manually in `beforeEach`/`afterEach`).

## Notes

- Secrets are set explicitly in `beforeEach` (not inherited from `.env`) because the unit-test runner does not load dotenv. The values are simple strings (`'test-access-secret'`, `'test-refresh-secret'`), not real cryptographic material.
- `tokens` on the user document is `select: false`, so any test that inspects stored tokens must use `findByIdWithCredentials` rather than reading the in-memory object returned by `createUser`.
- The `signAs` helper is the single source of "how a test token looks to the key-ring." If `keyId` logic changes, every fixture breaks at once.
- Revocation tests deliberately assert the pre-revocation success case *before* calling `tokenRemoveAll`, so a vacuous pass (token never worked in the first place) is ruled out.
- The `rotateRefreshToken` and `TokenReuseError` imports suggest rotation/replay tests exist further down in the (truncated) file.
