---
source: src/modules/account/tests/integration/session-modes.test.ts
sha256: 646f68c6eb20416c20a7ac4a42c25d2b4199ec8397fb0827e3b9e7cab87f9d9b
generated_at: 2026-10-15T10:13:57.872415+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/session-modes.test.ts

## Purpose

Integration test suite that exercises the full session lifecycle—login, "remember me" tiers, logout, revocation, step-up, 2FA, password change/reset, and OAuth provider login—through the real HTTP routes. The entire suite runs under **both** `NODE_SESSION_MODE` values (`jwt` and `cookie`) to verify that the strategy port delivers the same behavioral contract regardless of the chosen mode. Mode-specific assertions (origin checks, bearer tokens, refresh pairs, id renewal) live in the same tests and branch on the mode.

## Key elements

- **`MODES`** — `['jwt', 'cookie']` constant; drives the outer `describe.each` so every test executes under both modes.
- **`signIn` / `account`** — helpers that POST to `/account/login`, then collect the session credential(s) in the shape each mode uses (bearer + refresh cookie for `jwt`, cookie alone for `cookie`) and create a fresh verified user.
- **`statusOfSession` / `statusOfCredential`** — liveness checks that hit `GET /account` (cookie) or `POST /account/refresh` (jwt) with a bare cookie, returning the HTTP status.
- **`keepAlive`** — simulates the mode-specific way a client extends a session: a no-op `GET /account` in cookie mode, a full refresh in jwt mode.
- **`armTotp`** — sets up and confirms a TOTP factor via the settings endpoints; returns the confirm response (which re-mints the session) and the factor secret.
- **`claimedBy`** — reads the `amr` claim from the refresh token (jwt) or the DB row (cookie) to assert what authentication method the session records.
- **`oauthLogin`** — performs a start → callback round-trip through the registered `fake` OAuth provider.
- **`TIERS`** — the three "remember me" durations (1 day, 7 days, 30 days) used to assert `Max-Age` on the session cookie.
- **`maxAgeOf` / `clears`** — small helpers that parse `Set-Cookie` lines to assert expiry/clearing behavior.
- **`eventually`** — polls a read up to 40 × 50 ms for an async write to become visible.
- **`sessionsOf` / `ownSessionId`** — fetch `GET /account/sessions` and resolve the caller's current session id.

## Relationships

- **`scenarios/support/doubles/oauth-fake.ts`** — provides `fakeOAuthProvider`, registered via `registerOAuthProvider` in `beforeAll` so the provider-login tests can exercise a real OAuth round-trip without a live provider.
- **`src/modules/account/oauth/providers/index.ts`** — exports `registerOAuthProvider`, used to wire the fake provider into the test app.
- **`src/modules/account/session/strategy.ts`** — imports `activeStrategy` and the `SessionRequest` type; the test verifies the strategy port's contract is identical across modes.
- **`src/modules/account/session/mint-guard.ts`** — imports `SecondFactorRequiredError` for step-up / 2FA-gate assertions.
- **`src/modules/account/session/config.ts`** — imports `getAccessTokenRing` and `getRefreshTokenAudience` to read jwt-mode configuration (ring, audience).
- **`src/modules/account/session/key-ring.ts`** — imports `keyId` for jwt signing/verification in tests.
- **`src/infrastructure/security/hash-token.ts`** — imports `hashToken` to assert that session credentials are stored only as hashes, never plaintext.
- **`src/modules/account/repository.ts`** — imports `sessionRepository` (indirectly exercised through the factories and HTTP responses).
- **`src/modules/account/services/index.ts`** — imports `accountService` for service-level assertions.
- **`src/modules/account/tests/factories.ts`** — imports `plantToken`, `sessionRowFor`, `sessionRowsOf` for direct DB inspection and token planting.
- **`src/modules/users/index.ts`** — imports `userService` for user-related assertions.
- **`src/modules/users/tests/factories.ts`** — imports `createUser`, `userRepository`, `PLAIN_PASSWORD`, `REPLACEMENT_PASSWORD` to create and manage test accounts.

## Notes

- The **`fake` OAuth provider is test-only**; production code never registers it. Registering it in `beforeAll` is the sole coupling to `oauth-fake.ts`.
- In `jwt` mode the **access token is stateless** and remains valid for up to its `exp` (≤ 10 min) even after the session is revoked. What revocation ends is the *renewal* path (the refresh cookie), not the already-issued token. Tests must use the refresh endpoint to confirm liveness, not the access token.
- **CORS / origin checks** apply only in `cookie` mode. The single allowed origin (`https://shop.example`) is set via `NODE_CORS_ORIGIN` in every `beforeEach`; cookie-mode write requests must carry a matching `Origin` header.
- The `eventually` helper (40 × 50 ms ≈ 2 s) exists because some writes (e.g., a revocation or re-mint) land *after* the HTTP response is sent. Flaky failures here usually mean a write is genuinely not happening, not just slow.
- `jose`'s `decodeJwt` is used strictly to **read back** the payload the app itself signed; it performs no signature verification. Do not add verification logic here—this is a test-side inspection, not a security check.
- The file is truncated in the source provided; the test cases cover logout-this, logout-everywhere, revocation of one session, password change/reset, step-up, 2FA login, factor arming, and provider login, each asserted under both modes.
