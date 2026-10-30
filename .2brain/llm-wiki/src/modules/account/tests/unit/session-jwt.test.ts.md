---
source: src/modules/account/tests/unit/session-jwt.test.ts
sha256: 345f4de3469ec2f6df3beeb15e22940a1c338fb29cd973e7a697b39ecee1ed0b
generated_at: 2026-10-29T03:06:02.990745+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/session-jwt.test.ts

## Purpose

Unit-level tests for the token layer in `@modules/account/session/jwt`. Asserts safety invariants: the access and refresh secrets never cross-verify, refresh tokens are only valid while still stored, `jti` prevents same-second mutual revocation, and key-ring rotation does not mass-logout. The session store and `userService` are replaced with stubs; the actual query behaviour is covered in `../integration/auth-storage.test.ts`.

## Key elements

- **`signAs(secret, payload, opts)`** — Signs a JWT fixture the same way `jwt.ts` does: stamps `kid: keyId(secret)`, `auth_time`, `amr`, `typ` (`at+jwt` / `rt+jwt` per RFC 9068), `jti`, and the correct `iss`/`aud`. Accepts `null` to omit a registered claim.
- **`holdingLive()`** — Configures `sessionRepository.findByHash` and `userService.findAuthenticatableById` to answer as a live session row owned by a sign-in-eligible user.
- **`mintable()`** — Configures the same doubles plus `touchLastActive` and `sessionRepository.insert` for `startSession` tests.
- **`signedInUser()`** — Minimal user shape returned by `findAuthenticatableById`.
- **`accessWith({ issuer, audience })`** — Convenience wrapper over `signAs` for registered-claim variation tests.
- **`beforeEach`** — Calls `jest.resetAllMocks()` (not `clearAllMocks`) and sets `NODE_TOKEN_*` / `NODE_SESSION_TIME_*` environment values via `setEnvironment`.
- **Mock factory for `@modules/users`** — Spreads the real module, replaces `findAuthenticatableById` and `touchLastActive` with `jest.fn()`.
- **Mock factory for `@modules/account/repository`** — Spreads the real module, replaces `findByHash` and `insert` with `jest.fn()`.
- **`describe('verifyAccessToken')`** — Covers happy-path resolution, missing `sid`, cross-secret rejection, reason classification (expired / forged / retired key / malformed), no-expiry rejection, missing `auth_time`/`amr`, and `alg:none` forgeries (both with and without a real `kid`).
- **`describe('the registered claims')`** — Parameterised (`it.each`) refusal of wrong or missing `iss`/`aud` per RFC 8725 §3.10 / RFC 9068 §2.2.

## Relationships

- **`@modules/account/session/jwt`** — Module under test; imports `verifyAccessToken`, `verifyRefreshToken`, `createAccessToken`, `startSession`, `FIRST_PARTY_CLIENT_ID`.
- **`@modules/account/session/key-ring`** — Imports `keyId` so every fixture carries the `kid` the ring expects.
- **`@modules/account/session/config`** — Imports `getAccessTokenAudience`, `getRefreshTokenAudience`, `getTokenIssuer` to stamp correct registered claims (and to override them in negative cases).
- **`@infrastructure/security/hash-token`** — Imports `hashToken` for refresh-token digest assertions.
- **`@modules/account/repository`** — Mocked at the module level; `sessionRepository.findByHash` and `.insert` are the doubles.
- **`@modules/users`** — Mocked at the module level; `userService.findAuthenticatableById` and `.touchLastActive` are the doubles.
- **`tests/support/stub`** — `asStub<T>()` gives typed mock access to the sparsely-replaced doubles.
- **`tests/support/environment`** — `setEnvironment` injects the secret and time-window variables each test reads.

## Notes

- **`kid` is mandatory on every fixture.** A token signed without `kid` will never resolve to a ring member and will be rejected with "Unknown signing key" regardless of signature validity.
- **`auth_time` and `amr` are app-level required claims.** `signAs` injects them by default; omitting them (set to `undefined`) is itself a test case that must produce a `malformed` / "Wrong claims" refusal.
- **`alg:none` + real `kid`** is the stricter forgery case: the ring resolves a secret *before* verification, so this test is what actually exercises the `algorithms: ['HS256']` pin rather than just the kid-lookup miss.
- **`resetAllMocks` vs `clearAllMocks`:** the suite uses `reset` so that a `.mockRejectedValue` set in one test does not leak into the next (clear would preserve the implementation).
- **Scope boundary:** this file does *not* test what the repository queries do against a real store; that is the integration suite's job. Only the contract between `jwt.ts` and its injected dependencies is exercised here.
