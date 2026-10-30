---
source: src/modules/account/tests/integration/oauth-links.test.ts
sha256: dfdfef70adce294addf3c0e27accbaa7396f76001906a032968d10fedade4103
generated_at: 2026-10-29T02:57:45.954235+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/oauth-links.test.ts

## Purpose

Integration tests for the connected-accounts (OAuth provider) surface of the account module. Covers listing linked providers via `GET /account/oauth/links`, disconnecting one via `DELETE /account/oauth/links/{provider}`, reauth-freshness enforcement, cross-account isolation, and the content of the reset-confirm email that names still-connected providers.

## Key elements

- **`mockOutbox`** – module-level array that captures every `enqueueEmail` call (template + data) so tests can assert mail content without a real transport.
- **`linkedAccount()`** – helper that creates a verified user, links both `google` and `github` providers through `userRepository.linkOAuthAccount`, performs a password login, and returns the user, bearer token, and `__Host-session` cookie.
- **`linksOf(userId)`** – reads stored `oauthAccounts` straight from the database (via `findByIdWithCredentials`) to assert DB-level state.
- **`resetFor(token)`** – issues a `POST /account/password/reset/confirm` call with `REPLACEMENT_PASSWORD`.
- **`describe('GET /account/oauth/links')`** – two tests: happy-path listing (and a `not.toContain('-subject')` assertion that `providerId` is never leaked) and empty-list + 401-for-anonymous.
- **`describe('DELETE /account/oauth/links/{provider}')`** – five tests: disconnect-one-leave-other, 404 for already-disconnected, removal of the last sign-in method, reauth-freshness (401 `REAUTH_REQUIRED` after the sensitive window elapses), and cross-account 404.
- **`describe('the reset-confirm mail')`** – two tests asserting the `account.reset-confirm` email names remaining providers ("Google, Github") or explicitly states none are connected.

## Relationships

- **`tests/support/http.ts`** (`api`) – every request in the file goes through the shared `api()` helper.
- **`tests/support/setup-test-db.ts`** (`setupTestDb`) – called once at module scope to seed/reset the test database.
- **`tests/support/environment.ts`** (`setEnvironment`) – sets `NODE_MAIL_TRANSPORT` to `'outbox'` in `beforeEach` so the mocked mailer captures output.
- **`tests/support/clock.ts`** (`freezeDate`, `advanceDate`) – used in the reauth-freshness test to age the session past `reauthWindowSeconds`.
- **`tests/support/cookies.ts`** (`cookieHeader`) – extracts the `__Host-session` cookie from the login response for the refresh-based reauth test.
- **`src/kernel/config.ts`** (`reauthWindowSeconds`) – supplies the window duration (with `'sensitive'` tier) that the reauth test advances past.
- **`src/modules/users/tests/factories.ts`** (`createUser`, `userRepository`, `PLAIN_PASSWORD`, `REPLACEMENT_PASSWORD`) – user creation, OAuth linking, and the two password constants used for login and reset.
- **`src/modules/users/repository.ts`** (`userRepository`) – `linkOAuthAccount` and `findByIdWithCredentials` are called directly to set up and verify DB state.
- **`src/modules/account/tests/factories.ts`** (`plantToken`) – seeds a one-time password-reset token so the reset-confirm endpoint can be exercised without the full token-issuance flow.

## Notes

- `mockOutbox` is a module-level mutable array; `beforeEach` truncates it (`length = 0`) rather than reassigning, so the jest mock closure stays valid across tests.
- The reauth test depends on `afterEach(() => jest.useRealTimers())`; if a test before it forgets to call `freezeDate`, the timer restore is a no-op but still safe.
- The `REPLACEMENT_PASSWORD` import appears on two consecutive lines (a redundant duplicate); functionally harmless but a lint cleanup candidate.
- The security assertion in the first GET test serialises the entire response body to JSON and greps for the literal `providerId` value (`-subject`), a deliberate guard against accidental leakage of the opaque provider identifier.
