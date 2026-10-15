---
source: src/modules/account/tests/unit/session-jwt.test.ts
sha256: d3992e5dd211f5ba0494a911ac6f44d04615e3488680661a51df570e35a23e0e
generated_at: 2026-10-15T10:15:52.038858+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/session-jwt.test.ts

## Purpose

Unit tests for the JWT token layer (`account/session/jwt.ts`). Asserts the safety invariants of the signing/verification pipeline: access and refresh secrets never cross-verify, a refresh token is only valid while its row is still stored, `jti` (randomUUID) prevents two same-second logins from mutually revoking, and key-ring rotation does not cause mass logout. The session store and `userService` are **stubbed** (not driven); query correctness against a real store lives in `../integration/auth-storage.test.ts`.

## Key elements

- **`signAs(secret, payload, opts)`** — Signs a fixture JWT the same way `jwt.ts` does: stamps `kid: keyId(secret)`, RFC 9068 `typ` (`at+jwt` / `rt+jwt`), `auth_time`, `amr`, and `client_id` (access only). `null` omits a claim; `undefined` stamps the environment default.
- **`holdingLive()`** — Configures `sessionRepository.findByHash` and `userService.findAuthenticatableById` so a presented refresh token resolves to a live, unexpired session row.
- **`mintable()`** — Configures the same two services plus `sessionRepository.insert` so `startSession` can find the user and persist its row.
- **`signedInUser()`** — Minimal user shape (`id`, `tokensValidAfter`, `twoFactorEnabledAt`) returned by `findAuthenticatableById`.
- **`mockedUsers` / `mockedSessions`** — `asStub`-wrapped handles over the jest-mocked `userService` and `sessionRepository` for per-test assertion.
- **`describe('verifyAccessToken', …)`** — Covers: valid verification, missing `sid`, cross-secret rejection, forged signature, expired / retired-key / non-JWT classification, missing `exp`, missing `auth_time`+`amr`, and `alg: none` forgery (with and without a real `kid`).
- **`beforeEach`** — `jest.resetAllMocks()` (not `clearAllMocks`) plus `setEnvironment` for the four token/session TTL variables.

## Relationships

- **`@modules/account/session/jwt`** — Module under test; imports `verifyAccessToken`, `verifyRefreshToken`, `createAccessToken`, `startSession`, `FIRST_PARTY_CLIENT_ID`.
- **`@modules/account/session/key-ring`** — `keyId(secret)` is used in every fixture to stamp the `kid` header that `jwt.ts` uses to resolve the ring member.
- **`@modules/account/session/config`** — `getAccessTokenAudience`, `getRefreshTokenAudience`, `getTokenIssuer` supply the registered-claim defaults so fixtures match what `jwt.ts` stamps.
- **`@infrastructure/security/hash-token`** — `hashToken` imported (used by `verifyRefreshToken` / `startSession` to digest the presented token before the store lookup).
- **`@modules/users`** — Mocked; `userService.findAuthenticatableById` and `touchLastActive` are replaced with `jest.fn()`, all other members pass through via `...actual.userService`.
- **`@modules/account/repository`** — Mocked; `sessionRepository.findByHash` and `insert` are replaced, the rest pass through.
- **`@tests/stub`** — `asStub` narrows the mocked objects to the specific methods the test asserts on.
- **`@tests/environment`** — `setEnvironment` injects the four TTL / secret variables before each test.

## Notes

- **`kid` is mandatory on fixtures.** A token signed without `kid: keyId(secret)` will never match a ring member, because `kid` is the sole lookup key.
- **`jest.resetAllMocks()` vs `clearAllMocks()`.** The file deliberately uses `reset` so that a `mockRejectedValue` set in one test does not leak into the next; `clear` would wipe only the call log and preserve the implementation.
- **`null` vs `undefined` in `signAs` options.** `null` omits the claim entirely (e.g. no `iss`); `undefined` stamps the environment-derived default. Confusing the two silently changes which code path under test is exercised.
- **`alg: none` tests.** The second forgery (naming a real `kid`) is the case that actually exercises the `algorithms: ['HS256']` pin in `jose`'s `verify`, because `verifyAgainstRing` resolves the secret from `kid` *before* the algorithm check. The first (no `kid`) fails earlier at the kid lookup.
- **`FIRST_PARTY_CLIENT_ID`** is stamped on access tokens only; refresh fixtures omit `client_id` by design.
