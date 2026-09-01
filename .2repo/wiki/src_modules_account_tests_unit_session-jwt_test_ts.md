# src/modules/account/tests/unit/session-jwt.test.ts

## Purpose

Unit-level security-property tests for the token layer (`src/modules/account/session/jwt.ts`). Asserts the invariants that keep JWTs safe: the access and refresh secrets never cross-verify, a refresh token is only valid while its record is still stored, `jti: randomUUID()` prevents same-second mutual revocation, and HS256 is pinned at signing time. The `@modules/users` dependency is **replaced** (module-level `jest.mock`) rather than driven with real data.

## Key elements

- **`beforeEach`** — resets all mocks (via `jest.resetAllMocks`, not `clearAllMocks`) and sets the five `NODE_TOKEN_*` env vars (access/refresh secrets, short/long TTLs).
- **`describe('verifyAccessToken')`** — happy-path decode, rejection of refresh-secret tokens, wrong-signature, expired, and garbage inputs.
- **`describe('verifyRefreshToken')`** — requires storage lookup (`findByTokenValue`) in addition to signature check; rejects revoked, cross-secret, invalid-signature (without hitting DB), and DB-failure cases.
- **`describe('createRefreshToken')`** — verifies `tokenAdd` is called with `TokenType.REFRESH`, HS256 header, unique `jti` across calls, correct unit pairing (seconds on `exp`, ms on stored expiry), and `User not found` rejection.
- **`describe('createAccessToken')`** — mints only from a still-stored refresh token; signs with the access secret, HS256, short TTL.
- **`userDouble()`** — factory returning a minimal user document double (`tokenAdd` mock + `select: undefined`) matching the shape `createRefreshToken` touches.
- **`findByIdReturning(user)`** — one-line helper to set the `findByIdWithCredentials` mock resolution.
- **`mockedUsers`** — `asStub<{...}>(userRepository)` giving typed `.mock` access to the three repository methods.

## Relationships

- **`src/modules/account/session/jwt.ts`** — the module under test; the suite imports its five exported functions (`verifyAccessToken`, `verifyRefreshToken`, `createRefreshToken`, `createAccessToken`, `recordRefreshTokenUse`).
- **`src/modules/users/index.ts`** — mocked at the module level via `jest.mock('@modules/users', …)`, overriding `userRepository` with three `jest.fn()` stubs while preserving other exports; also supplies the `TokenType` enum.
- **`src/modules/users/repository.ts`** — the three stubbed methods (`findByTokenValue`, `findByIdWithCredentials`, `tokenTouch`) correspond to this repository's interface; the actual query shapes are asserted separately in the repository's integration spec.
- **`src/modules/users/model.ts`** — indirectly referenced: `userDouble()` mirrors the user document surface (`tokenAdd`, `select`) that the model provides to the code under test.
- **`tests/support/stub.ts`** — provides `asStub`, the typed wrapper that lets the test access `.mock` members of the repository stubs without `as` casts.

## Notes

- **`resetAllMocks` vs `clearAllMocks`**: the suite deliberately uses `reset` (wipes both call log *and* implementation) in `beforeEach`. A `clear` would leave a `mockResolvedValue`/`mockRejectedValue` set in one test leaking into the next.
- **Refactored surface**: comments note that `session/jwt.ts` previously ran three raw `Users` queries inline; those are now repository methods, so this suite doubles the repository instead of the model.
- **Unit pairing gotcha**: JWT `exp` is in **seconds**, the stored record expiry is a **JavaScript timestamp (ms)**. The `remember-me` test asserts both halves (`exp - iat === 2_592_000` and `tokenAdd` arg `=== 2_592_000 * 1000`) to catch drift.
- **Algorithm pinning is tested at signing time only**; the complementary verification-side guard lives in the library's defaults and is not independently asserted here.
- The file is truncated in the provided content; the `createAccessToken` describe block and any trailing helpers (`recordRefreshTokenUse` tests, etc.) may contain additional cases not listed above.
