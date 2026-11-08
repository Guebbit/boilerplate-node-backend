---
source: src/modules/account/tests/integration/oauth-links.test.ts
sha256: dfdfef70adce294addf3c0e27accbaa7396f76001906a032968d10fedade4103
generated_at: 2026-11-08T04:38:57.991672+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/oauth-links.test.ts

## Purpose

Integration tests for the connected-accounts surface: listing which OAuth providers a user has linked, disconnecting a provider (including the reauth-session requirement and cross-account isolation), and verifying that the reset-confirm email names the providers still attached. Exercises the real HTTP routes against a real test database.

## Key elements

- **`mockOutbox`** — module-level array; the jest mock for `@infrastructure/adapters/mailer.enqueueEmail` pushes every queued mail here so tests can assert on template + data.
- **`linkedAccount()`** — creates a verified user, links `google` and `github` via `userRepository.linkOAuthAccount`, performs a real login, and returns `{ user, bearer, cookie }`.
- **`linksOf(userId)`** — reads the user's stored `oauthAccounts` directly from the DB (bypasses the API) to assert persistence.
- **`resetFor(token)`** — POSTs to `/account/password/reset/confirm` with a fixed replacement password.
- **`GET /account/oauth/links`** block — asserts provider list shape, absence of provider-identifier leakage, empty list for password-only users, and 401 without a session.
- **`DELETE /account/oauth/links/{provider}`** block — covers single-disconnect, 404 on unknown provider, removing the last sign-in method, the `REAUTH_REQUIRED` gate when the session is stale, and cross-account 404.
- **`the reset-confirm mail`** block — plants a reset token via `plantToken`, fires the confirm route, and asserts the `account.reset-confirm` template carries the correct provider names (or the "no provider" copy).

## Relationships

- **`@tests/http`** (`api`) — every assertion goes through the supertest-style `api()` helper.
- **`@tests/setup-test-db`** (`setupTestDb`) — called once at module level to prepare the test database.
- **`@tests/environment`** (`setEnvironment`) — switches `NODE_MAIL_TRANSPORT` to the `outbox` mock per test.
- **`@tests/clock`** (`freezeDate`, `advanceDate`) — drives the reauth-window expiry test by advancing time past `reauthWindowSeconds('sensitive')`.
- **`@tests/cookies`** (`cookieHeader`) — extracts the session cookie from a login response for the refresh-based reauth test.
- **`@kernel/config`** (`reauthWindowSeconds`) — provides the sensitivity-specific window used to calculate how far to advance the frozen clock.
- **`@modules/users/tests/factories`** (`createUser`, `userRepository`, `PLAIN_PASSWORD`, `REPLACEMENT_PASSWORD`) — seeds users, links OAuth rows, and supplies the well-known passwords for login and reset.
- **`@modules/account/tests/factories`** (`plantToken`) — inserts a valid reset token directly into the token store for the mail tests.
- **`@modules/users/repository`** (`userRepository`) — used both by `linkedAccount` (to link providers) and `linksOf` (to read them back).

## Notes

- `setupTestDb()` runs at **module scope**, not inside a `beforeAll`; the file relies on jest's single-process-per-file model for isolation.
- The mailer mock spreads `jest.requireActual` so any other adapter exports remain intact; only `enqueueEmail` is replaced.
- The reauth test depends on the **refresh cookie** issuing a token whose `auth_time` is old — the access token alone would expire naturally; the cookie path is what makes `auth_time` stale.
- `connectedAt` is hard-coded to `2026-01-01` in the helper; tests that assert the exact value in the JSON response will break if that date changes.
- The "never a provider identifier" assertion uses `JSON.stringify(...).not.toContain('-subject')` rather than a structural check — it catches leakage anywhere in the body.
