---
source: src/modules/account/tests/integration/session-modes.test.ts
sha256: f4e49882512d870c2c80d7c728509d9e40a10be0455dcbf2a504b874a4ecc550
generated_at: 2026-11-08T04:43:27.550833+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/session-modes.test.ts

## Purpose

Integration test that exercises the full account session lifecycle through real HTTP routes under both `NODE_SESSION_MODE` values (`cookie` and `jwt`). Every scenario in the first `describe` block runs identically in both modes to verify the strategy port's contract; mode-specific blocks (cookie origin checks, `ses_…` bearer tokens, JWT access/refresh pairs) follow. It also covers mode-switching boundaries: a session issued by one mode is not honoured by the other.

## Key elements

- **`logIn(email, body)`** – thin wrapper around `POST /account/login` that always sets the `Origin` header to the file's single allowed frontend origin.
- **`signIn(email, mode)`** – performs a login and packages the client's credentials: `jwt` mode returns `{ Authorization: Bearer …, Cookie: … }`; `cookie` mode returns `{ Cookie: … }` only.
- **`account(mode, email)`** – creates a verified user via the test factory and immediately signs them in; the standard fixture for most tests.
- **`statusOfSession` / `statusOfCredential`** – probes whether a session is still alive using the mode-appropriate route (`GET /account` for cookie, `POST /account/refresh` for jwt).
- **`keepAlive(session, mode)`** – advances the session the way a client would (plain `GET /account` or a refresh call) and returns the updated headers.
- **`armTotp(headers)`** – runs the two-step TOTP setup → confirm flow and returns the confirm response plus the factor secret.
- **`claimedBy(cookie)`** – decodes the `amr` (authentication method) claim: reads the JWT payload directly in `jwt` mode, reads the DB row's field in `cookie` mode.
- **`oauthLogin()`** – performs a full start → callback round-trip against the registered `fake` OAuth provider.
- **`TIERS`** – the three "remember me" durations (`short` 86 400 s, `medium` 604 800 s, `long` 2 592 000 s) used in cookie `Max-Age` assertions.
- **`maxAgeOf` / `clears`** – parse `Set-Cookie` lines for `max-age` or a 1970 expiry (i.e. cookie deletion).
- **`eventually(read)`** – polls up to 40 × 50 ms for a write that lands after the HTTP response returned.
- **`describe.each(MODES)`** – the outer parameterised block; inner `beforeEach` sets `NODE_SESSION_MODE`.

## Relationships

- **`@scenarios/support/doubles/oauth-fake`** – provides `fakeOAuthProvider`, registered via `registerOAuthProvider('fake', …)` in `beforeAll` so the OAuth round-trip test can exercise the callback path without a real identity provider.
- **`../../oauth/providers/index`** – supplies `registerOAuthProvider`, the runtime hook the test uses to inject the fake.
- **`../../repository`** (`sessionRepository`) – queried directly (via `sessionRowsOf` from the shared factory) to assert what the DB actually stores for a session row.
- **`../../services`** (`accountService`) – available for service-level assertions or setup in tests that go below the route layer.
- **`../../session/strategy`** – imports `activeStrategy` and the `SessionRequest` type; tests assert the strategy port returns the correct mode-appropriate adapter.
- **`../../session/mint-guard`** – imports `SecondFactorRequiredError` to assert the 2FA gate rejects a session that hasn't completed step-up.
- **`../../session/config`** – imports `getAccessTokenRing` and `getRefreshTokenAudience` for token-decoding assertions in `jwt`-mode tests.
- **`../../session/key-ring`** – imports `keyId` to identify the signing key in JWT assertions.
- **`@infrastructure/security/hash-token`** – `hashToken` is used to verify stored token hashes match what the test expects.
- **`@modules/users/tests/factories`** – provides `createUser`, `userRepository`, and the shared password constants used to seed accounts.
- **`@modules/users`** – imports `userService` for user-level operations (e.g. password change) that affect sessions.
- **`../factories`** (`plantToken`, `sessionRowFor`, `sessionRowsOf`) – shared test helpers for directly inserting or reading session rows, bypassing the HTTP layer when a test needs to inspect or fabricate DB state.

## Notes

- The file runs every shared scenario **twice** (once per mode) via `describe.each`. A failure in one mode does not stop the other; both must pass independently.
- `FRONTEND` is the single allowed CORS origin for the entire file; tests that mutate `NODE_CORS_ORIGIN` must restore it (handled by `beforeEach` calling `setEnvironment`).
- The `fake` OAuth provider is registered in `beforeAll` and is **not** part of the production provider set — production code paths that iterate registered providers will see it only in this test process.
- `statusOfSession` deliberately uses the *refresh* endpoint (not the access token) in `jwt` mode because the access token is stateless and outlives revocation for up to its lifetime window; the refresh endpoint is the true liveness probe.
- The `eventually` poller exists because some writes (e.g. a `Set-Cookie` that clears a row) commit after the response is sent; tests must not assert synchronously.
- The `claimedBy` helper uses `decodeJwt` from `jose` **without** signature verification — the test only reads back a claim the app itself signed, so verification is unnecessary and would require re-deriving the key.
