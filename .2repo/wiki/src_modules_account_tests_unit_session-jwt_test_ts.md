# src/modules/account/tests/unit/session-jwt.test.ts

## Purpose

Unit-level tests for the JWT token layer in `account/session/jwt.ts`. While integration suites prove the flows work end-to-end, this file pins down the safety properties that fail silently: secret separation between access and refresh tokens, revocation enforcement (a token is only valid while stored), uniqueness of issued tokens via `jti`, and correct algorithm/expiry wiring. It exercises those invariants in isolation with the users module fully replaced.

## Key elements

- **`verifyAccessToken` tests** — asserts payload resolution, rejection of refresh-secret tokens, bad signatures, expired tokens, and malformed input.
- **`verifyRefreshToken` tests** — asserts the dual check (signature *and* storage lookup via `findByTokenValue`), that DB errors reject rather than resolving `null`, and that a failed signature never reaches the database.
- **`createRefreshToken` tests** — asserts `tokenAdd` is called with `TokenType.REFRESH`, the refresh secret is used, `alg` is pinned to `HS256`, consecutive tokens have distinct `jti` values, remember-me seconds vs. milliseconds are consistent, and a missing user rejects.
- **`createAccessToken` tests** — asserts it mints a valid access token from a still-stored refresh token and refuses otherwise (truncated in source).
- **`recordRefreshTokenUse`** — imported from the SUT; tests present (truncated in source).
- **`userDouble()`** — minimal object exposing `tokenAdd` (a `jest.fn` resolving `'stored'`) and `select: undefined`, standing in for the users model.
- **`findByIdReturning(user)`** — convenience helper that sets `mockedUsers.findByIdWithCredentials` to resolve with a given user.
- **`beforeEach`** — calls `jest.resetAllMocks()` (not `clearAllMocks`, to avoid leaking rejected implementations between tests) and sets all `NODE_TOKEN_*` env vars.

## Relationships

- **`src/modules/account/session/jwt.ts`** — the system under test. All five exported functions are imported and driven.
- **`src/modules/users/index.ts`** — mocked via `jest.mock('@modules/users', …)`. The test imports `userRepository` and `TokenType` from it; the mock replaces `userRepository` with three `jest.fn()` stubs.
- **`src/modules/users/repository.ts`** — the concrete implementations of `findByTokenValue`, `findByIdWithCredentials`, and `tokenTouch` that the mock substitutes. The test asserts *which* method is called and with what arguments, not how the query is shaped.
- **`src/modules/users/model.ts`** — the shape of the user document (specifically the `tokenAdd` method) that `userDouble()` mirrors.
- **`tests/support/stub.ts`** — provides `asStub`, used to cast `userRepository` to a type whose fields are `jest.Mock`, enabling type-safe assertion on call counts and arguments.

## Notes

- The mock replaces the **repository**, not the model. The file explicitly documents that raw Mongoose queries (`.select('+tokens')`, positional `tokens.$` updates) moved into the repository layer and are asserted in `users/tests/integration/repository.test.ts` against a real store.
- `jest.resetAllMocks()` is used deliberately over `clearAllMocks()`: `clear` preserves the `mockResolvedValue`/`mockRejectedValue` implementation, so a rejection set in one test would leak into the next.
- The `asStub` helper is used instead of `jest.spyOn` on the module namespace; the file's header comment references `tests/support/ports.ts` for the rationale.
- `TokenType.REFRESH` is asserted on the first argument to `tokenAdd` to catch a misfiled token type that would cause the wrong revocation path to target it.
- Environment variables (`NODE_TOKEN_ACCESS`, `NODE_TOKEN_REFRESH`, `NODE_TOKEN_ACCESS_TIME`, `NODE_TOKEN_REFRESH_TIME_SHORT`, `NODE_TOKEN_REFRESH_TIME_LONG`) are set in `beforeEach`; tests depend on these exact values (e.g., `exp − iat === 2_592_000`).
