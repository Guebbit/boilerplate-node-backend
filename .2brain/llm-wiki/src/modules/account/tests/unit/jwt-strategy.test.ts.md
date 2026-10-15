---
source: src/modules/account/tests/unit/jwt-strategy.test.ts
sha256: 135e2d4daafd9b9447c6f59d0c883f207cd6b62558d8654eae9397e3f3179ac4
generated_at: 2026-10-15T10:15:12.216472+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/jwt-strategy.test.ts

## Purpose

Unit-level tests for the `jwtStrategy` adapter (`session/jwt-strategy.ts`), verifying the wiring between the strategy port and the token layer: which mint path a login uses versus a re-mint, what lands in which cookie, and how a token refusal maps to a resolver miss while an infrastructure outage stays a rejection. The token layer itself is tested elsewhere (`session-jwt.test.ts`) and is fully replaced by mocks here.

## Key elements

- **Mock setup** — `jest.mock` blocks replace `session/jwt` (token layer), `repository` (session store), and `session/auth-context` (proof resolver). `TokenRejection` is kept real via `jest.requireActual` so tests can assert on it.
- **`tokens` stub** — `asStub` over the mocked `jwt` module; exposes `startSession`, `continueSession`, `createAccessToken`, `rememberOfRefreshToken`, `verifyAccessToken`, `verifyRefreshToken`, `verifyRefreshWithRow`.
- **`sessions` stub** — `asStub` over `sessionRepository`; covers all row-level and family-level operations.
- **`proof` stub** — single mock for `resolveProof`.
- **`describe('issue')`** — login path: asserts `startSession` is used (not `continueSession`), refresh cookie is set, access token is returned; `remember` tier sets `maxAge` on both cookies; bearer transport still sets the cookie.
- **`describe('reissue')`** — re-mint path: asserts `continueSession` is used with the tier from `rememberOfRefreshToken`, old row is retired via `hashToken`, snapshot fallback when the row is already gone, and that a store outage during retirement still resolves successfully.
- **`describe('remint')`** — silent re-mint: sets a fresh refresh cookie, returns `{}` (no access token), and a failed re-mint degrades to "sign in again" without throwing.
- **`describe.each(['resolveBearer','resolveCookie'])`** — parametrized resolution tests: correct verifier is called, claims are forwarded to `resolveProof`, `TokenRejection` becomes `{ miss }`, and a generic `Error` propagates as a rejection.
- **Constants** — `USER_ID`, `SHOPPER` (the resolved proof shape), `FAMILY_ID`.

## Relationships

- **`session/jwt-strategy.ts`** — the system under test; all assertions target its exported `jwtStrategy` object.
- **`session/jwt.ts`** — fully mocked; only `TokenRejection` class is preserved real.
- **`repository.ts`** — `sessionRepository` methods are individually mocked.
- **`session/auth-context.ts`** — `resolveProof` is mocked to control what the strategy receives back.
- **`session/config.ts`** — `RefreshTokenExpiryTime` enum values used as tier arguments.
- **`infrastructure/security/hash-token.ts`** — `hashToken` used in assertions to confirm the strategy hashes tokens before store calls.
- **`tests/strategy-doubles.ts`** — provides `cookieSet`, `recordingResponse`, `requestWith` helpers shared across strategy tests.
- **`tests/support/stub.ts`** — `asStub` typed helper for accessing jest mocks.
- **`tests/support/environment.ts`** — `setEnvironment` to pin `NODE_SESSION_TIME_MEDIUM` for tier-duration assertions.

## Notes

- `beforeEach` calls `jest.resetAllMocks()` then re-applies default resolved values; any test that needs a different default must override after that reset.
- The `remember` tier assertion uses `86_400_000` (24 h in ms), derived from the `NODE_SESSION_TIME_MEDIUM=86400` env var set in `beforeEach`.
- `describe.each` pairs each strategy method with its expected verifier name; adding a new resolver requires extending the tuple array.
- The `remint` failure test asserts `cookie` was **not** called — the strategy swallows the error and the caller must prompt re-login.
