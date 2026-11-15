---
source: src/modules/account/tests/unit/session-jwt.test.ts
sha256: 15ec5c999e732aa09d61654f54e939a443c391763ccd0460b6354819ce55e724
generated_at: 2026-11-14T19:16:36.479015+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/session-jwt.test.ts

## Purpose

Unit test suite for the session JWT token layer (`src/modules/account/session/jwt.ts`). It asserts security invariants at the token level—secret separation (access vs. refresh), refresh-token validity tied to a stored row, `jti` uniqueness, key-ring rotation without mass logout, and claim-shape enforcement—while the session store and user service are stubbed out. Query-level correctness is deliberately left to `../integration/auth-storage.test.ts`.

## Key elements

- **`signAs(secret, payload, opts)`** — Signs a JWT fixture exactly as `jwt.ts` does: stamps `kid: keyId(secret)`, sets `typ` (`at+jwt` / `rt+jwt`), fills in `iss`/`aud` from `config.ts` defaults, and includes `auth_time` + `amr` which `TokenData` requires. Central helper for every fixture in the file.
- **`holdingLive()`** — Configures `sessionRepository.findByHash` and `accountUserService.findAuthenticatableById` to return a live session row and a sign-in-eligible user (used by `verifyRefreshToken` cases).
- **`mintable()`** — Configures the mocks so `startSession` can find its user and insert a session row.
- **`accessWith(options)`** — Convenience wrapper around `signAs` that varies only `iss`/`aud` for registered-claim tests.
- **`beforeEach`** — Calls `jest.resetAllMocks()` (not `clearAllMocks`) and sets `NODE_TOKEN_ACCESS`, `NODE_TOKEN_REFRESH`, `NODE_TOKEN_ACCESS_TIME`, `NODE_SESSION_TIME_SHORT`, `NODE_SESSION_TIME_LONG` via `setEnvironment`.
- **`describe('verifyAccessToken')`** — Covers: valid token resolution, missing `sid`, cross-secret rejection, refusal reasons (`expired`, `invalid_signature`, `malformed`, `Unknown signing key`), infinite-expiry tokens, missing `auth_time`/`amr`, and `alg:none` forgeries (with and without a real `kid`).
- **`describe('the registered claims')`** — RFC 8725 §3.10 / RFC 9068 §2.2 table-driven tests: wrong or missing `iss`/`aud` must be refused.
- **`jest.mock('@modules/users/friends/account', …)`** — Spreads the real module, then overrides only `findAuthenticatableById` and `touchLastActive` on `accountUserService`.
- **`jest.mock('@modules/account/repository', …)`** — Same pattern for `sessionRepository.findByHash` and `insert`.

## Relationships

- **`src/modules/account/session/jwt.ts`** — Module under test; the file imports `verifyAccessToken`, `verifyRefreshToken`, `createAccessToken`, `startSession`, and `FIRST_PARTY_CLIENT_ID`.
- **`src/modules/account/session/config.ts`** — Provides `getAccessTokenAudience`, `getRefreshTokenAudience`, `getTokenIssuer` used to build claim-realistic fixtures.
- **`src/modules/account/session/key-ring.ts`** — Provides `keyId(secret)` so fixtures carry the same `kid` the ring expects.
- **`src/modules/account/repository.ts`** — `sessionRepository` is mocked (only `findByHash`, `insert` replaced; other members pass through).
- **`src/modules/users/friends/account.ts`** — `accountUserService` is partially mocked (only `findAuthenticatableById`, `touchLastActive` replaced).
- **`src/infrastructure/security/hash-token.ts`** — `hashToken` is imported, used to compute the digest the refresh-token store is expected to look up.
- **`tests/support/environment.ts`** — `setEnvironment` injects the `NODE_TOKEN_*` / `NODE_SESSION_TIME_*` variables each test depends on.
- **`tests/support/stub.ts`** — `asStub` gives a typed handle over the mocked objects for clean call-assertion syntax.

## Notes

- **`kid` is mandatory on fixtures.** A token signed without `kid` will not match any ring member and is rejected at lookup, before signature verification. `signAs` always stamps it via `keyId(secret)`.
- **`resetAllMocks` vs. `clearAllMocks`.** The file deliberately uses `resetAllMocks` in `beforeEach` so that a `mockRejectedValue` set in one test does not leak into the next (only the call log would be wiped with `clear`).
- **`alg:none` attack is tested twice:** once with no `kid` (fails at key lookup) and once naming a real `kid` (gets past lookup, then fails on the `algorithms: ['HS256']` pin). The second case is the one that actually exercises the algorithm whitelist.
- **Scope boundary.** The file asserts *what* the token layer rejects/accepts, not *how* the repository queries behave. If a test seems to need a real store, it belongs in `../integration/auth-storage.test.ts`.
- **`auth_time` and `amr` are hard requirements** in the `TokenData` shape; `signAs` injects them by default. Passing `undefined` for either (as the "bare" test does) deliberately omits them to verify the rejection path.
