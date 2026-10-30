---
source: src/modules/account/tests/integration/session-modes.test.ts
sha256: fe135d1f7dc2eb41b34e69638d54f3f73d98f703e7ce2aa64cab77f1c0940058
generated_at: 2026-10-29T03:01:34.130379+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/session-modes.test.ts

## Purpose

Integration test that exercises the full account session lifecycle (login, logout, revocation, password change, step-up, 2FA, OAuth) through real HTTP routes under **both** `NODE_SESSION_MODE` values (`jwt` and `cookie`). It verifies that the strategy port fulfils the same behavioural contract regardless of transport, and that sessions never cross between modes.

## Key elements

- **`MODES`** – `['jwt', 'cookie'] as const`; drives `describe.each` so every test runs twice, once per mode.
- **`signIn` / `logIn`** – Helper that hits `POST /account/login` and returns the mode-appropriate credentials (Bearer + refresh cookie for `jwt`, bare cookie for `cookie`).
- **`account`** – Creates a fresh user via `createUser` and immediately signs them in; the standard fixture for most tests.
- **`statusOfSession` / `statusOfCredential`** – Checks a session is still alive using the mode's keep-alive mechanism (`GET /account` for cookie, `POST /account/refresh` for jwt).
- **`keepAlive`** – Simulates the periodic refresh a real client performs; returns the updated headers.
- **`TIERS`** – The three "remember me" durations (86 400 / 604 800 / 2 592 000 s) used to assert `Max-Age` on `Set-Cookie`.
- **`armTotp`** – Walks the TOTP setup → confirm flow so a factor is active for step-up / 2FA tests.
- **`oauthLogin`** – Completes a start → callback round-trip through the `fake` OAuth provider.
- **`claimedBy`** – Reads back the `amr` claim from either the JWT payload (`jose.decodeJwt`) or the DB row, proving the app records *how* the user authenticated.
- **`eventually`** – Polls a read up to 40 × 50 ms to absorb post-response writes.
- **`beforeAll`** – Registers the `fake` OAuth provider so the route handler can find it.
- **`beforeEach`** – Sets `NODE_CORS_ORIGIN` to `https://shop.example` and mail transport to `outbox`; the outer `describe.each` `beforeEach` sets `NODE_SESSION_MODE`.

## Relationships

- **`scenarios/support/doubles/oauth-fake.ts`** – `fakeOAuthProvider` is the sole OAuth provider registered for these tests; `oauthLogin` exercises its redirect + callback.
- **`src/modules/account/oauth/providers/index.ts`** – `registerOAuthProvider` is called in `beforeAll` to make the fake discoverable by the route.
- **`src/modules/account/session/strategy.ts`** – `activeStrategy` and `SessionRequest` type are imported; the tests exercise whatever strategy is active for the current mode.
- **`src/modules/account/session/config.ts`** – `getAccessTokenRing` and `getRefreshTokenAudience` provide the JWK / audience values the tests need to decode or validate tokens.
- **`src/modules/account/session/key-ring.ts`** – `keyId` is used to select the correct signing key when inspecting JWTs.
- **`src/modules/account/session/mint-guard.ts`** – `SecondFactorRequiredError` is the error type asserted when a step-up is demanded mid-flow.
- **`src/modules/account/tests/factories.ts`** – `plantToken`, `sessionRowFor`, `sessionRowsOf` give direct DB access for assertions the HTTP layer cannot express (e.g. credential never stored in plaintext).
- **`src/modules/account/repository.ts`** – `sessionRepository` is imported for direct row inspection.
- **`src/modules/account/services/index.ts`** – `accountService` is available for service-level setup/teardown where a route is insufficient.
- **`src/infrastructure/security/hash-token.ts`** – `hashToken` is used to compare stored hashes in DB assertions.
- **`src/modules/users/index.ts`** – `userService` (and via re-export, user domain types) supports the `createUser` factory and user-related assertions.

## Notes

- The file is **mode-agnostic by design**: every `it` body is written once and parameterised over `MODES`. When adding a new scenario, the test must hold under both transports; if a behaviour is genuinely mode-specific, the assertion is branched on `mode` inside the single `it`.
- `signIn` in `jwt` mode returns **both** the access token and the refresh cookie; the access token is intentionally *not* used for keep-alive checks because it is stateless and outlives the session for up to 10 minutes. Liveness is always verified through the refresh/cookie path.
- The `fake` OAuth provider is registered in `beforeAll` and is **never** present in production; tests that call `/account/oauth/fake` rely on this registration and will 404 without it.
- `claimedBy` uses `jose.decodeJwt` (unverified) purely to *read back* what the app itself signed; it is not a security assertion.
- The `Origin` header is sent on every mutating request because `cookie`-mode writes enforce a CORS origin check; omitting it causes a 403 in cookie mode but is harmless in jwt mode.
- `scripts/docs/generate-persona-tables.ts` and `src/modules/account/tests/unit/family-liveness.test.ts` appear in the dependency graph but are not directly imported or exercised by this file.
