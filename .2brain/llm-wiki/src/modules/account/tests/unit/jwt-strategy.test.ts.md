---
source: src/modules/account/tests/unit/jwt-strategy.test.ts
sha256: 3c0f4c9002c3efb2293db9aacd42ce07d88cc5bab5148d81ed15cdf6ff1acf10
generated_at: 2026-10-14T14:45:12.770023+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/jwt-strategy.test.ts

## Purpose

Unit tests for the `jwtStrategy` adapter (`session/jwt-strategy.ts`), focusing on the wiring between the strategy port and the token layer. Covers `issue`, `reissue`, `remint`, `resolveBearer`/`resolveCookie`, and `credentialOf` — verifying which mint path is taken, what lands in which cookie, and how token refusals vs. outages are distinguished. The token layer itself is fully mocked; its own behavior belongs to `session-jwt.test.ts`.

## Key elements

- **`issue` block** — asserts the guarded login door (`startSession`), refresh-cookie setting (`__Host-session`), access-token response, tier-based `maxAge`, and that `transport: 'bearer'` still sets the cookie.
- **`reissue` block** — asserts unguarded re-mint via `continueSession`, tier carried from the presented refresh cookie (`rememberOfRefreshToken`), retirement of the old hash (`removeByHash`), family cleanup (`removeFamilyExcept`), snapshot fallback when the row is already gone, and graceful success when retirement fails.
- **`remint` block** — asserts the unguarded door, fresh cookie, no access-token call, and that a failed re-mint resolves `undefined` (degrades to "sign in again") rather than throwing.
- **`resolveBearer` / `resolveCookie` (parameterized `describe.each`)** — asserts the correct verifier is called, claims are handed to `resolveProof`, a `TokenRejection` becomes a resolver `{ miss }`, and a generic `Error` propagates as a rejection.
- **`resolveBearer and the session it names`** — asserts the `familyIsLive` liveness check and that a revoked family yields `{ miss: 'revoked' }`.
- **`credentialOf`** (truncated in source) — present in the file.
- **Doubles** — `tokens`, `sessions`, `proof` created via `asStub` from the mocked modules; `cookieSet`, `recordingResponse`, `requestWith` from `strategy-doubles`.
- **`beforeEach`** — resets all mocks, sets `NODE_SESSION_TIME_MEDIUM: '86400'`, and provides default resolved values for every stub.

## Relationships

- **`session/jwt-strategy.ts`** — the system under test; every `describe` block exercises its exported `jwtStrategy` object.
- **`session/jwt.ts`** — fully mocked (`jest.mock`); its functions (`startSession`, `continueSession`, `createAccessToken`, `rememberOfRefreshToken`, `verifyAccessToken`, `verifyRefreshToken`) are replaced with `jest.fn()`; `TokenRejection` is re-exported from the real module so assertions can construct refusal instances.
- **`repository.ts`** — `sessionRepository` is spread-merged with mock methods (`removeByHash`, `removeFamilyByHash`, `removeFamilyExcept`, `findByHash`, `familyIsLive`, `listLive`).
- **`session/auth-context.ts`** — `resolveProof` is mocked to a single `jest.fn()`.
- **`session/config.ts`** — imports `RefreshTokenExpiryTime` enum values used in test arguments and assertions.
- **`infrastructure/security/hash-token.ts`** — `hashToken` is called in assertions to verify that retired tokens are stored as hashes.
- **`tests/strategy-doubles.ts`** — provides `cookieSet`, `recordingResponse`, and `requestWith` helpers used throughout.
- **`tests/support/stub.ts`** — `asStub` wraps already-mocked modules into typed `jest.Mock` accessors.
- **`tests/support/environment.ts`** — `setEnvironment` configures the `NODE_SESSION_TIME_MEDIUM` env var before each test.

## Notes

- The token layer is explicitly **replaced**, not spied on; any test that needs real token logic must live in `session-jwt.test.ts`.
- The critical behavioral contract: `TokenRejection` → resolver **miss** (graceful), generic `Error` → **rejection** propagates (outage). Both `resolveBearer` and `resolveCookie` follow this, and `remint` adds a third path: failure → resolves `undefined` (no cookie, no error).
- `issue` with `transport: 'bearer'` still writes the `__Host-session` cookie; the comment clarifies there is "no session id to hand back" — the cookie is the only channel.
- The `NODE_SESSION_TIME_MEDIUM` env var is set to `86400` seconds; assertions compare `maxAge` in **milliseconds** (`86_400_000`).
