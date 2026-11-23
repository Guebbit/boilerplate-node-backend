---
source: src/modules/account/tests/integration/session-modes.test.ts
source_sha256: c81b05806c673b2a432c25cf0e5cd18e4cac13d0bcae8344d3e675068782528f
context_sha256: 439efe04760f2b0fcc5142885470cd3e4683af0b98dcef06f681c9d06715e056
generated_at: 2026-11-22T04:01:58.755186+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/integration/session-modes.test.ts

## Purpose
Integration test for the account module's two session modes, `jwt` and `cookie` (selected by `NODE_SESSION_MODE`). It drives the real HTTP routes. The first block, `describe.each(MODES)`, runs the same assertions under both modes, which tests the promise of the session strategy port. Mode-specific blocks and a "switching" block (a session belongs to the mode that issued it) are described in the header comment. They are not visible in the part of the file shown here.

## Key elements
- **`MODES`**: `['jwt', 'cookie']`, the values the shared block is parameterised over.
- **`logIn(email, body)`**: `POST /account/login` with the `Origin` header set to `FRONTEND`, the way a browser sends it.
- **`signIn(email, mode)`**: logs in and returns a `SignedIn` object (`response`, `headers`, `cookie`). In `jwt` mode the headers are the access-token bearer plus the `__Host-session` refresh cookie. In `cookie` mode they are the cookie alone.
- **`account(mode, email)`**: creates a verified customer and signs it in.
- **`statusOfSession` / `statusOfCredential`**: check whether a session is still alive. They use `GET /account` in `cookie` mode and `POST /account/refresh` in `jwt` mode. They deliberately avoid the access token, which is stateless and outlives revocation.
- **`statusOfBearer` / `statusOfCookie`**: status of `GET /account` for a `ses_…` bearer or a bare cookie.
- **`sessionsOf`, `ownSessionId`**: read `GET /account/sessions` and find the entry marked `current`.
- **`keepAlive`**: uses the session the way each mode keeps it alive. `cookie` mode calls `GET /account`. `jwt` mode refreshes and returns new headers.
- **`TIERS`, `maxAgeOf`, `clears`**: the "remember me" tiers (short 1 day, medium 7 days, long 30 days), a `Max-Age` parser, and a check for cookie-clearing `Set-Cookie` lines.
- **`armTotp`**: sets up and confirms a TOTP factor through the 2FA routes, using `codeFor`. It returns the confirm response and the secret.
- **`claimedBy`**: reads the `amr` claim. In `jwt` mode it decodes the refresh token with `decodeJwt`. For a `ses_…` id it reads the database row via `sessionRowFor`.
- **`oauthLogin`**: a full start-to-callback round trip through the `fake` OAuth provider.
- **`eventually`**: polls for a write that lands after the response.
- **Visible tests in `describe.each`**: `/config` reports the mode and lifetimes. A login authenticates the next request. The session list has one entry marked current, and its `createdAt` matches the row's `startedAt`. The credential never appears in the list or the database.

## Relationships
- **`@tests/*` helpers** (`http`, `setup-test-db`, `environment`, `clock`, `cookies`, `stub`, `totp`): provide the HTTP client, DB setup, env overrides, date freezing, cookie parsing and TOTP codes. `tests/support/clock.ts` is the clock source.
- **`scenarios/support/doubles/oauth-fake.ts`**: supplies `fakeOAuthProvider`. It is registered under `'fake'` through `registerOAuthProvider` from `oauth/providers`, because production never registers it.
- **`users/tests/factories`**: `createUser`, `userRepository`, and the `PLAIN_PASSWORD` and `REPLACEMENT_PASSWORD` constants.
- **`../factories`** (account tests): `plantToken`, `sessionRowFor`, `sessionRowsOf`.
- **`session/strategy`**: `activeStrategy` and the `SessionRequest` type.
- **`session/mint-guard`**: `SecondFactorRequiredError`.
- **`session/config`, `session/key-ring`**: `getAccessTokenRing`, `getRefreshTokenAudience` and `keyId`.
- **`../../repository` and `../../services`**: `sessionRepository` and `accountService`.
- **`users/friends/account`**: `accountUserService`.
- **`infrastructure/security/hash-token`**: `hashToken`.
- **`src/modules/account/tests/unit/family-liveness.test.ts`**: listed as a graph neighbour. No interaction is visible in the shown content.

## Notes
- The shared block calls `setEnvironment({ NODE_SESSION_MODE: mode })`. The file-level `beforeEach` sets `NODE_CORS_ORIGIN` to `https://shop.example` and `NODE_MAIL_TRANSPORT` to `outbox`.
- In `cookie` mode, writes check `Origin`, so the helpers send it.
- Access tokens are stateless. Revocation ends the ability to obtain a next session, not the existing access token.
- `jose` (`SignJWT`, `decodeJwt`) is imported. The `decodeJwt` use is documented as an unverified read of what the app itself signed.
