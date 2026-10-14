---
source: src/modules/account/tests/integration/session-modes.test.ts
sha256: 501d12f37316f9d90b80270a860d878f3c016ef910d589b32582f3fe32f6c8fe
generated_at: 2026-10-14T14:42:07.077697+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/session-modes.test.ts

## Purpose

Integration test that exercises both session modes (`cookie` and `jwt`) through real HTTP routes. It parameterizes every test over `MODES = ['jwt', 'cookie']` so the same scenario assertions hold regardless of which transport a deployment runs, while mode-specific blocks cover bearer-vs-cookie semantics, token renewal, origin checks, and mode-switching isolation.

## Key elements

- **`MODES`** – `['jwt', 'cookie']` constant; drives `describe.each` so all tests run twice.
- **`signIn` / `account`** – helpers that perform a real `POST /account/login` and package the mode-appropriate credentials (Bearer + refresh cookie, or session cookie alone) into a `SignedIn` record.
- **`statusOfCredential` / `statusOfSession`** – probe whether a session is still alive: `GET /account` in cookie mode, `POST /account/refresh` in jwt mode.
- **`keepAlive`** – mimics the client's keep-alive: a no-op `GET` for cookie mode, a refresh rotation for jwt mode.
- **`TIERS` / `maxAgeOf` / `clears`** – remember-me duration constants (7 d / 30 d / 365 d) and helpers to inspect `Set-Cookie` `Max-Age` and expiry lines.
- **`armTotp`** – drives the two-step TOTP setup + confirm flow, returning the confirm response and the secret.
- **`claimedBy`** – reads the `amr` claim from a session credential (JWT payload via `jose`'s `decodeJwt`, or DB row for `ses_…` ids).
- **`oauthLogin`** – performs a full start → callback round-trip through the registered `fake` OAuth provider.
- **`eventually`** – 40-attempt / 50 ms polling helper for writes that land after the response returns.
- **`describe.each(MODES)` block** – the test suite itself: login, session listing, credential non-leakage, scoped vs. global logout, password change/reset, step-up, 2FA login, provider login, id renewal, and mode-crossing rejection.

## Relationships

- **`tests/support/http.ts`** – all HTTP calls go through the `api()` helper from this module.
- **`tests/support/environment.ts`** – `setEnvironment` sets `NODE_SESSION_MODE`, `NODE_CORS_ORIGIN`, and `NODE_MAIL_TRANSPORT` per test.
- **`tests/support/clock.ts`** – `freezeDate` / `advanceDate` control time for token-expiry and tier-duration assertions.
- **`tests/support/cookies.ts`** – `cookieHeader`, `cookieValue`, `setCookie` parse and construct `Cookie` / `Set-Cookie` values.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` resets the database before the suite runs.
- **`src/modules/users/tests/factories.ts`** – provides `createUser`, `userRepository`, `PLAIN_PASSWORD`, and `REPLACEMENT_PASSWORD` for seeding accounts.
- **`src/modules/users/repository.ts`** – accessed indirectly via `userRepository` for user-row assertions.
- **`src/modules/account/tests/factories.ts`** – `plantToken`, `sessionRowFor`, `sessionRowsOf` for direct DB inspection and token planting.
- **`src/modules/account/repository.ts`** – `sessionRepository` imported for session-row queries.
- **`src/modules/account/session/strategy.ts`** – `activeStrategy` and `SessionRequest` type used where the test inspects or stubs the strategy port.
- **`src/modules/account/session/mint-guard.ts`** – `SecondFactorRequiredError` imported to assert 2FA-gated flows.
- **`src/modules/account/oauth/providers/index.ts`** – `registerOAuthProvider('fake', …)` in `beforeAll` makes the fake provider discoverable.
- **`scenarios/support/doubles/oauth-fake.ts`** – `fakeOAuthProvider` supplies the OAuth redirect / token-endpoint behavior.
- **`src/infrastructure/security/hash-token.ts`** – `hashToken` verifies that session credentials are stored only as hashes, never plaintext.

## Notes

- The `fake` OAuth provider is registered exclusively in this file's `beforeAll`; production code paths never register it. Tests that call `oauthLogin` depend on that registration.
- `NODE_SESSION_MODE` must be set **before** the app under test reads it; the `beforeEach` inside each `describe` block handles this, but the outer `setEnvironment` in the top-level `beforeEach` sets CORS and mail transport for both modes.
- In jwt mode the access token is stateless and valid for up to 10 minutes after revocation; the tests therefore assert on the **refresh** flow (the mechanism to obtain a *next* token), not on the access token's lifetime. See the `statusOfSession` doc-comment.
- `decodeJwt` from `jose` is used unverified (test-only read-back of app-signed claims); do not pattern-match this as a security practice.
- The `FRONTEND` origin constant (`https://shop.example`) is the single allowed `Origin` for the entire file; any test that sends writes in cookie mode must include it or the origin check will reject the request.
