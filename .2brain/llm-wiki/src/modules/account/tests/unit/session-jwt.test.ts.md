---
source: src/modules/account/tests/unit/session-jwt.test.ts
sha256: 345f4de3469ec2f6df3beeb15e22940a1c338fb29cd973e7a697b39ecee1ed0b
generated_at: 2026-11-08T04:49:55.308377+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/session-jwt.test.ts

## Purpose

Unit-level security tests for the JWT token layer (`src/modules/account/session/jwt.ts`). Asserts the invariants that keep it safe: the access and refresh secrets never cross-verify, a refresh token is only valid while still stored, `jti` prevents same-second mutual revocation, and key-ring rotation does not mass-logout. The session store and user service are **stubbed**, not driven—query-shape assertions live in `../integration/auth-storage.test.ts`.

## Key elements

- **`signAs(secret, payload, opts?)`** — Signs a JWT fixture the way `jwt.ts` itself does: stamps `kid: keyId(secret)`, sets `typ` (`at+jwt` / `rt+jwt` per RFC 9068), fills `auth_time`/`amr`, and uses `null` vs `undefined` in `issuer`/`audience` options to omit vs. default a claim.
- **`holdingLive()`** — Configures `sessionRepository.findByHash` and `userService.findAuthenticatableById` so `verifyRefreshToken` sees a live, unexpired row.
- **`mintable()`** — Configures the same doubles plus `touchLastActive` and `sessionRepository.insert` so `startSession` can proceed.
- **`accessWith(options)`** — Convenience wrapper around `signAs` that overrides one registered claim (`iss` or `aud`) to test RFC 8725 / 9068 enforcement.
- **`jest.mock('@modules/users')`** — Spreads the real module, then replaces `findAuthenticatableById` and `touchLastActive` with `jest.fn()`.
- **`jest.mock('@modules/account/repository')`** — Same pattern for `sessionRepository.findByHash` and `.insert`.
- **`describe('verifyAccessToken')`** — Happy-path, cross-secret rejection, error-reason taxonomy (expired / forged / retired key / malformed / missing claims), `alg:none` forgery (with and without a real `kid`).
- **`describe('the registered claims')`** — Parametrized table (`it.each`) over wrong/missing `iss` and `aud`.

## Relationships

- **`src/modules/account/session/jwt.ts`** — System under test; imports `verifyAccessToken`, `verifyRefreshToken`, `createAccessToken`, `startSession`, `FIRST_PARTY_CLIENT_ID`.
- **`src/modules/account/session/key-ring.ts`** — Imports `keyId` to compute the `kid` value stamped into every fixture header.
- **`src/modules/account/session/config.ts`** — Imports `getAccessTokenAudience`, `getRefreshTokenAudience`, `getTokenIssuer` so fixtures carry the same registered claims the app uses.
- **`src/infrastructure/security/hash-token.ts`** — Imports `hashToken` for refresh-token hash comparisons.
- **`src/modules/users/index.ts`** — Mocked; doubles `userService.findAuthenticatableById` and `.touchLastActive`.
- **`src/modules/account/repository.ts`** — Mocked; doubles `sessionRepository.findByHash` and `.insert`.
- **`tests/support/stub.ts`** — Provides `asStub<T>` for typed access to the `jest.fn()` handles.
- **`tests/support/environment.ts`** — Provides `setEnvironment` to set `NODE_TOKEN_*` vars before each test.

## Notes

- `beforeEach` uses `jest.resetAllMocks()` (not `clearAllMocks`) so that a rejection set in one test cannot leak into the next and fail it with the wrong error.
- Every fixture **must** carry `kid: keyId(secret)` in the protected header. A fixture signed without one will never resolve a ring member and fails with `invalid_signature` / "Unknown signing key" rather than exercising the intended assertion.
- In `signAs`, passing `issuer: null` or `audience: null` **omits** the claim; passing `undefined` stamps the real app value. This distinction is what lets the registered-claims table exercise "no `iss`" vs. "another `iss`".
- The `alg: none` forgery test with a real `kid` is the case that actually exercises the `algorithms: ['HS256']` pin in `jose`'s verify options—the no-`kid` variant stops at the ring lookup.
- What this file does **not** cover: the shape of SQL/repository queries, two-factor gating logic, or integration-level session lifecycle—those are delegated to `../integration/auth-storage.test.ts` and other suites.
