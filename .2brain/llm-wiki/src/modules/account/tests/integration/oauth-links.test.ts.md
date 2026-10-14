---
source: src/modules/account/tests/integration/oauth-links.test.ts
sha256: cf91315d13e91e707c97251d838e8cc602ed808ad5cea0e09d4d3930d12dd2b2
generated_at: 2026-10-14T09:11:39.585764+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/oauth-links.test.ts

## Purpose

Integration tests for the connected-accounts (OAuth links) API surface: listing linked providers, disconnecting a single provider under the reauth guard, and verifying that the password-reset confirmation email names the providers still attached to the account.

## Key elements

- **`mockOutbox`** – module-level array that captures every call to the mocked `enqueueEmail`; used to assert mail template and payload after a reset.
- **`jest.mock('@infrastructure/adapters/mailer', …)`** – replaces `enqueueEmail` with a spy that pushes into `mockOutbox`; all other exports are preserved via `requireActual`.
- **`linkedAccount()`** – creates a verified user, links Google and GitHub rows via `userRepository.linkOAuthAccount`, logs in through `POST /account/login`, and returns `{ user, bearer, cookie }` for subsequent calls.
- **`linksOf(userId)`** – reads `oauthAccounts` straight from the repository (bypassing the API) so tests can assert DB ground truth.
- **`resetFor(token)`** – thin wrapper that `POST`s to `/account/reset-confirm` with `REPLACEMENT_PASSWORD`.
- **`describe('GET /account/oauth/links')`** – asserts the provider list + `connectedAt`, confirms no `providerId` leaks, empty list for password-only accounts, and 401 for anonymous.
- **`describe('DELETE /account/oauth/links/{provider}')`** – covers single-provider removal, 404 on unknown provider, removal of the last sign-in method, the `REAUTH_REQUIRED` 401 when the session is stale, and cross-account isolation (404 + owner's links intact).
- **`describe('the reset-confirm mail')`** – plants a reset token with `plantToken`, calls `resetFor`, then inspects `mockOutbox` for the `account.reset-confirm` template to confirm the provider names (or the "No Google or GitHub sign-in" phrasing).

## Relationships

| Neighbor | Interaction |
|---|---|
| `tests/support/http.ts` | Provides `api()` – the supertest-based HTTP client used for every request. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` initialises the shared test database before the suite runs. |
| `tests/support/environment.ts` | `setEnvironment({ NODE_MAIL_TRANSPORT: 'outbox' })` in `beforeEach` ensures the mock mailer is selected. |
| `tests/support/clock.ts` | `freezeDate` / `advanceDate` drive the reauth-window test (advance past `reauthWindowSeconds('sensitive')`). |
| `tests/support/cookies.ts` | `cookieHeader(login, '__Host-session')` extracts the session cookie from the login response. |
| `src/kernel/config.ts` | `reauthWindowSeconds('sensitive')` sets the exact threshold the reauth test must exceed. |
| `src/modules/users/tests/factories.ts` | `createUser`, `userRepository`, `PLAIN_PASSWORD`, `REPLACEMENT_PASSWORD` – user creation, OAuth-link insertion, and credential constants. |
| `src/modules/account/tests/factories.ts` | `plantToken` seeds a password-reset token directly in the DB for the mail tests. |
| `src/modules/users/repository.ts` | Consumed indirectly through the users factories (`userRepository.linkOAuthAccount`, `findByIdWithCredentials`). |

## Notes

- The reauth test depends on the access token expiring *during* the frozen-clock window and then relying on the refresh cookie to mint a new token whose `auth_time` is still older than the window – this is why `freezeDate` is set *before* login and `advanceDate` is called *after*.
- The assertion `expect(JSON.stringify(response.body)).not.toContain('-subject')` is a deliberate leak check: the `providerId` value is intentionally set to `google-subject` / `github-subject` so any accidental inclusion would be caught by a simple substring search.
- `setupTestDb()` is called once at module scope (outside any `beforeEach`), while `mockOutbox` is reset in `beforeEach`; forgetting either will cause cross-test contamination.
