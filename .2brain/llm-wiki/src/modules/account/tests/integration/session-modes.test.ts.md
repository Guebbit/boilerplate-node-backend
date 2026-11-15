---
source: src/modules/account/tests/integration/session-modes.test.ts
sha256: 77e0da43306d877653e86d238a56a2e5af4b2e6e6bb0c3926e9422f8dc290ca7
generated_at: 2026-11-14T19:12:04.326161+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/session-modes.test.ts

## Purpose

Integration test suite that exercises the full session lifecycle (login, remember-me tiers, keep-alive, revocation, 2FA, OAuth, password change/reset, step-up) against real HTTP routes under **both** `NODE_SESSION_MODE` values (`cookie` and `jwt`). The core promise it enforces: the strategy port exposes identical behavior regardless of which transport is active, and a session issued under one mode is never usable under the other.

## Key elements

- **`MODES` / `describe.each(MODES)`** – runs the entire suite twice, once per session mode, switching `NODE_SESSION_MODE` in `beforeEach`.
- **`signIn` / `account`** – helpers that hit `POST /account/login` and package the returned credential (bearer token + refresh cookie for `jwt`; session cookie alone for `cookie`) into a `SignedIn` object.
- **`statusOfSession` / `statusOfCredential` / `statusOfBearer` / `statusOfCookie`** – thin wrappers that probe a session's liveness using the mode-appropriate endpoint (`GET /account` vs `POST /account/refresh`).
- **`keepAlive`** – simulates the client's periodic renewal; for `jwt` mode it performs a refresh and returns the new token pair.
- **`TIERS`** – the three "remember me" durations (1 day / 7 days / 30 days) asserted via `Max-Age` on `Set-Cookie`.
- **`armTotp`** – drives the two-step TOTP setup + confirm flow and returns the confirm response (which re-mints the caller's session).
- **`oauthLogin`** – performs a full start → callback round trip through the registered `fake` OAuth provider.
- **`claimedBy`** – reads the `amr` (authentication method) claim back from either the refresh token (decoded via `jose`) or the session row in the database.
- **`eventually`** – polling helper for writes that land after the HTTP response returns.
- **`beforeAll` / `beforeEach`** – registers `fakeOAuthProvider` and sets `NODE_CORS_ORIGIN` to a fixed test origin.

## Relationships

- **`scenarios/support/doubles/oauth-fake.ts`** – provides `fakeOAuthProvider`, registered at the top of the suite so the OAuth round-trip tests work without a real IdP.
- **`src/modules/account/oauth/providers/index.ts`** – `registerOAuthProvider` is called in `beforeAll` to inject the fake provider into the runtime registry.
- **`src/modules/account/session/strategy.ts`** – imports `activeStrategy` and the `SessionRequest` type; the tests verify the port's contract holds in both modes.
- **`src/modules/account/session/config.ts`** – imports `getAccessTokenRing` and `getRefreshTokenAudience` for JWT assertion helpers.
- **`src/modules/account/session/key-ring.ts`** – imports `keyId` for token-signing assertions.
- **`src/modules/account/session/mint-guard.ts`** – imports `SecondFactorRequiredError`, asserted when a 2FA-gated action is attempted without the factor.
- **`src/modules/account/repository.ts`** – imports `sessionRepository` for direct row inspection (e.g. verifying credentials are not persisted in plaintext).
- **`src/modules/account/services/index.ts`** – imports `accountService` for service-level assertions alongside route-level ones.
- **`src/modules/account/tests/factories.ts`** – imports `plantToken`, `sessionRowFor`, `sessionRowsOf` to seed and read session rows directly.
- **`src/modules/users/tests/factories.ts`** – imports `createUser`, `userRepository`, `PLAIN_PASSWORD`, `REPLACEMENT_PASSWORD` to create accounts and drive password-change tests.
- **`src/modules/users/friends/account.ts`** – imports `accountUserService` for cross-module account assertions.
- **`src/infrastructure/security/hash-token.ts`** – imports `hashToken` for verifying stored token hashes.
- **`tests/support/clock.ts`** – imports `advanceDate` / `freezeDate` to control time-dependent assertions (token expiry, `Max-Age` boundaries).
- **`src/modules/account/tests/unit/family-liveness.test.ts`** – sibling test in the same directory; shares the factories and conventions but does not import from this file.

## Notes

- The test file is **mode-parametric**: every scenario runs under both `cookie` and `jwt`. When a test asserts on a header or cookie shape, it must branch on `mode` — the helper functions (`statusOfSession`, `keepAlive`, etc.) abstract this away, but new tests that inspect raw headers must remember to handle both shapes.
- The `fake` OAuth provider is **only** registered in this suite's `beforeAll`; it is absent from production. Do not assume it exists in other test files.
- `signIn` always sets the `Origin` header to `FRONTEND` (`https://shop.example`); `cookie`-mode origin checks depend on this matching `NODE_CORS_ORIGIN` (set in `beforeEach`).
- The `eventually` helper polls up to 40 × 50 ms (≈2 s). If a new write has longer async propagation, the test will fail with "the write never landed" rather than hanging.
- `claimedBy` uses `decodeJwt` from `jose` **without verification** — the comment notes this is intentional: the test reads back what the app itself signed.
- The file is truncated in this wiki snapshot; the full suite includes additional scenarios (logout-everywhere, revoking one session, password change/reset, step-up, cross-mode isolation) that follow the same helper patterns.
