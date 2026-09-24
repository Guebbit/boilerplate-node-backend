---
source: src/modules/account/tests/unit/session-jwt.test.ts
sha256: e7cc95880b0ecac1ab417b7b2c7cf9e544e136b006a1d041a06528ce001660be
generated_at: 2026-09-23T18:17:02.031540+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/session-jwt.test.ts

## Purpose

Unit test suite for the JWT token layer (`session/jwt.ts`). Asserts the security invariants that keep the layer safe: access/refresh secrets never cross-verify, refresh tokens are only valid while still stored in the user document, `jwtid: randomUUID()` prevents same-second mutual revocation, and the signing-key ring rotates without mass-logging-out existing tokens. `@modules/users` is replaced (not driven) so the suite tests token logic in isolation.

## Key elements

- **`jest.mock('@modules/users', …)`** — Partial mock: spreads the real `userService`, then replaces only `findByTokenValue`, `findByIdWithCredentials`, and `tokenTouch` with `jest.fn()`. All other members pass through unchanged.
- **`signAs(secret, payload, options)`** — Signs a fixture the same way `jwt.ts` does: stamps `keyid: keyId(secret)` in the header and defaults `auth_time` / `amr` (both required by `TokenData`). Fixtures signed without a `kid` would never match a ring member.
- **`userDouble()`** — Returns a minimal user object (`{ tokenAdd: jest.fn(), select: undefined }`) shaped to the one method `createRefreshToken` calls.
- **`findByIdReturning(user)`** — One-liner stub for `userService.findByIdWithCredentials`, avoiding manual query-chain mocking.
- **`mockedUsers`** — Typed stub (`asStub<…>`) over the mocked `userService`, giving type-safe access to the three replaced methods.
- **`describe` blocks** — `verifyAccessToken`, `verifyRefreshToken`, `the signing-key ring`, `createRefreshToken` (and `recordRefreshTokenUse`, truncated). Cover secret separation, revocation-by-storage, algorithm pinning (`alg: none` rejection), ring rotation (old tokens still verify, new tokens use first entry, dropped keys reject), and DB-failure propagation.
- **`alg: none` fixtures** — Hand-built as raw base64url segments because `jsonwebtoken.sign()` refuses to produce them. Two cases: one without `kid`, one naming a real `kid` to exercise the `algorithms: ['HS256']` pin past the kid-lookup step.

## Relationships

- **`src/modules/account/session/jwt.ts`** — Module under test. Imports `verifyAccessToken`, `verifyRefreshToken`, `createRefreshToken`, `createAccessToken`, `recordRefreshTokenUse`.
- **`src/modules/account/session/key-ring.ts`** — Imports `keyId` to stamp the `kid` header in every fixture, matching what `jwt.ts` itself stamps at sign-time.
- **`src/modules/users/index.ts`** — Mocked module boundary. Provides `userService` (partially replaced) and the `TokenType` enum used in token-storage calls.
- **`src/modules/users/service.ts`** — The concrete `userService` whose three methods are doubled; the rest of the service is untouched via the `...actual` spread.
- **`src/modules/users/model.ts`** — Referenced indirectly: `userDouble()` mirrors the model shape (`tokenAdd`, `select`) that `createRefreshToken` expects.
- **`tests/support/stub.ts`** — Provides `asStub` to give the mocked `userService` a precise method-level type for call assertions.

## Notes

- **`jest.resetAllMocks()` in `beforeEach`**, not `clearAllMocks`. Resetting wipes the resolved/rejected value assigned per test, preventing a rejection set in one case from leaking into the next.
- **Environment vars are set in `beforeEach`** (`NODE_TOKEN_ACCESS`, `NODE_TOKEN_REFRESH`, etc.). Ring-rotation tests overwrite `NODE_TOKEN_REFRESH` mid-suite with a comma-separated list to simulate a prepended key.
- **Partial mock convention**: the comment block above the `jest.mock` call explains that this file exercises the _service_ layer (`userService.findByTokenValue`, `.findByIdWithCredentials`, `.tokenTouch`), not raw Mongoose queries. Query-shape assertions live in `users/tests/integration/repository.test.ts`.
- **Hand-built `alg: none` tokens** are a deliberate workaround: `jsonwebtoken`'s own `sign()` will not emit them, so the test constructs the three base64url segments manually.
- **`createRefreshToken` tests** (truncated in the listing) drive `user.tokenAdd` to capture the stored token and inspect its decoded `kid` header via `decode(token, { complete: true })`.
