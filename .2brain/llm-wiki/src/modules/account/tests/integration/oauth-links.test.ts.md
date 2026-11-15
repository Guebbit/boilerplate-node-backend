---
source: src/modules/account/tests/integration/oauth-links.test.ts
sha256: 975ebe45ca2b220672b6bcf381963e4647ac9cf07bf780194b0fe30c08367063
generated_at: 2026-11-14T19:05:53.832457+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/oauth-links.test.ts

## Purpose

Integration tests for the connected-OAuth-provider endpoints under `/account/oauth/links` (list, disconnect) and for the password-reset confirmation email. Verifies that the API exposes provider names and timestamps (never raw provider identifiers), that disconnecting requires a fresh session, that only the caller's own links are addressable, and that the reset-confirm mail accurately reports which providers remain linked.

## Key elements

- **`linkedAccount()`** — creates a verified user, links `google` and `github` via `userRepository.linkOAuthAccount`, logs in, and returns the user record, a bearer token, and a `__Host-session` cookie.
- **`linksOf(userId)`** — reads `oauthAccounts` straight from the database via `findByIdWithCredentials`; used to assert post-DELETE state.
- **`resetFor(token)`** — POSTs to `/account/password/reset/confirm` with `REPLACEMENT_PASSWORD`.
- **`mockOutbox`** — array that captures every `enqueueEmail` call; populated through a `jest.mock` of `@infrastructure/adapters/mailer`.
- **`describe('GET /account/oauth/links')`** — tests provider listing, empty-list for password-only accounts, and 401 for anonymous requests.
- **`describe('DELETE /account/oauth/links/{provider}')`** — tests single-provider removal, 404 for unlinked provider, removing the last method, reauth-window enforcement (`REAUTH_REQUIRED`), and cross-account isolation.
- **`describe('the reset-confirm mail')`** — verifies the `account.reset-confirm` email body names the still-connected providers or states none are connected.

## Relationships

- **`tests/support/http.ts`** — `api()` helper used for every HTTP request in the file.
- **`tests/support/setup-test-db.ts`** — called once at module scope to prepare the test database.
- **`tests/support/environment.ts`** — `setEnvironment` sets `NODE_MAIL_TRANSPORT` to the outbox mock in `beforeEach`.
- **`tests/support/clock.ts`** — `freezeDate` / `advanceDate` drive the reauth-window expiry test.
- **`tests/support/cookies.ts`** — `cookieHeader` extracts the `__Host-session` cookie from a login response.
- **`src/kernel/config.ts`** — `reauthWindowSeconds('sensitive')` determines how far `advanceDate` must jump to expire the session.
- **`src/modules/users/tests/factories.ts`** — provides `createUser`, `PLAIN_PASSWORD`, `REPLACEMENT_PASSWORD`, and `userRepository` (used for linking OAuth accounts and querying stored credentials).
- **`src/modules/account/tests/factories.ts`** — `plantToken` seeds a password-reset token for the mail tests.
- **`src/modules/users/repository.ts`** — underlying data layer reached indirectly through the `userRepository` import from the factories module.

## Notes

- The mailer mock is declared with `jest.mock` at the top level; `mockOutbox` is reset in `beforeEach`, so assertions must run within the same test turn.
- The "needs a fresh session" test refreshes via cookie (the bearer token itself is expired by `advanceDate`), then uses the *newly minted* bearer for the DELETE. The 401 `REAUTH_REQUIRED` response is the assertion target.
- The API-response leak check (`not.toContain('-subject')`) guards against `providerId` leaking into the JSON payload.
- `afterEach` restores real timers, which is required because `freezeDate` switches Jest to fake timers.
