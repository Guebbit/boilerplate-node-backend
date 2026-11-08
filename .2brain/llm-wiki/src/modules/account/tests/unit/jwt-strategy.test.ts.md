---
source: src/modules/account/tests/unit/jwt-strategy.test.ts
sha256: 7c6d8004f7cf9c53d587651e8e1a78b71b43a6041372af4aef4e6891e82c1b52
generated_at: 2026-11-08T04:47:30.699098+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/jwt-strategy.test.ts

## Purpose

Unit-level tests for the `jwtStrategy` adapter (`session/jwt-strategy.ts`), verifying the wiring between the strategy port and the token layer: which mint path a login vs. re-mint takes, what lands in which cookie, and how a token refusal becomes a resolver miss while an infrastructure outage stays a thrown rejection. The token layer itself is replaced (mocked) here; its own behavior is covered by `session-jwt.test.ts`.

## Key elements

- **`tokens`** – typed stub over the mocked `@modules/account/session/jwt` module (`startSession`, `continueSession`, `createAccessToken`, `rememberOfRefreshToken`, `verifyAccessToken`, `verifyRefreshToken`, `verifyRefreshWithRow`).
- **`sessions`** – typed stub over the mocked `sessionRepository` (`removeByHash`, `removeFamilyByHash`, `removeFamilyExcept`, `findByHash`, `familyActivity`, `touchFamily`, `removeFamily`, `listLive`).
- **`proof`** – typed stub over the mocked `resolveProof` from `auth-context`.
- **`USER_ID`, `SHOPPER`, `FAMILY_ID`** – shared fixture constants for the account, its resolved identity, and its session family.
- **`describe('issue')`** – asserts the guarded login path: `startSession` → `createAccessToken`, refresh cookie set, tier/maxAge propagation, and that `bearer` transport still sets cookies.
- **`describe('reissue')`** – asserts the unguarded rotation path: `rememberOfRefreshToken` → `continueSession`, old-token retirement via `removeByHash` (hashed), family cleanup via `removeFamilyExcept`, snapshot fallback when the row is gone, and graceful handling when retirement fails.
- **`describe('remint')`** – asserts a fresh refresh cookie is set, no access token is returned, and a failed re-mint resolves to `{}` (degrade to "sign in again").
- **`describe.each(['resolveBearer', 'resolveCookie'], …)`** – parametrized verification tests: correct verifier called, claims passed to `resolveProof`, `TokenRejection` → `{ miss }`, generic `Error` → re-thrown.
- **`describe('resolveBearer and the session it names')`** – checks liveness of the token's own session family via `findByHash` / `familyActivity` before resolving proof.

## Relationships

- **`session/jwt-strategy.ts`** – the system under test; all assertions target its exported `jwtStrategy` object.
- **`session/jwt.ts`** – fully mocked (all functions replaced with `jest.fn`); `TokenRejection` is re-exported from the real module for use in tests.
- **`repository.ts`** – `sessionRepository` is partially mocked (spreads actual, overrides methods with `jest.fn`).
- **`session/auth-context.ts`** – `resolveProof` is mocked out entirely.
- **`infrastructure/security/hash-token.ts`** – `hashToken` is called in assertions to verify the repository receives a hashed token, not the raw value.
- **`tests/strategy-doubles.ts`** – supplies `cookieSet`, `recordingResponse`, and `requestWith` helpers for cookie assertion and request construction.
- **`types/index.ts`** – provides the `RememberTier` enum used in fixtures and expected cookie `maxAge` calculations.
- **`tests/support/environment.ts`** – `setEnvironment` configures `NODE_SESSION_TIME_MEDIUM` for tier-expiry assertions.
- **`tests/support/stub.ts`** – `asStub` casts the mock objects into typed `jest.Mock` fields without repeating type annotations.

## Notes

- The file explicitly does **not** test token minting/verification logic; that is delegated to a sibling test (`session-jwt.test.ts`). Everything here is about *wiring and adapter behavior*.
- `jest.mock` for `session/jwt` uses `jest.requireActual` to preserve the real `TokenRejection` class while stubbing all functions—tests can throw the real error type and still assert on it.
- The distinction between "token is bad" (`TokenRejection` → `{ miss: reason }`) and "infrastructure is down" (generic `Error` → re-thrown) is a core contract tested in both the resolve and reissue/remint paths.
- `remember: 'medium'` appears as a string in `continueSession` call assertions while the fixture uses `RememberTier.medium`—the adapter serialises the enum before calling the token layer.
- The `bearer` transport test exists to lock in the (non-obvious) fact that cookies are *still* set even when the client isn't expected to use them.
