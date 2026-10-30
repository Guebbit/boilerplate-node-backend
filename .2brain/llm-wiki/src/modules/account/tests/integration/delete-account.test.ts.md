---
source: src/modules/account/tests/integration/delete-account.test.ts
sha256: 654d6a3570143788e774cf0424e8cba344d493d2f784357f3ee4136f8027f71a
generated_at: 2026-10-29T02:54:42.434045+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/delete-account.test.ts

## Purpose

Integration tests exercising the full self-deletion and restoration flow over real HTTP against a real test database. Covers `DELETE /account` (lock, mail, session teardown) and `POST /account/restore` (cancel, single-use token, grace expiry), asserting the status codes and side-effects a caller actually observes.

## Key elements

- **`mockOutbox` + `jest.mock` mailer stub** — captures every enqueued email (template + data) so tests can assert what was "mailed" and extract the restore token from the link.
- **`authenticate(email?)`** — creates a verified user, performs a real login via `POST /account/login`, and returns the bearer token and session cookie for subsequent requests.
- **`mailedRestoreToken()`** — pulls the `#token=` fragment out of the `account.deletion-scheduled` mail's `linkUrl`.
- **`scheduled(email?)`** — convenience: runs `authenticate` → `DELETE /account` → returns `{ user, token }`.
- **`describe('DELETE /account')`** — verifies 202 + `requestedAt`/`purgeAt`, DB lock fields, cookie clearing, invalidation of bearer + refresh, deletion-pending flag at re-login, purge of other pending tokens, and 401 `REAUTH_REQUIRED` for a stale session.
- **`describe('POST /account/restore')`** — verifies 204 + no session issued, `account.restored` confirmation mail, single-use enforcement (422 on replay), identical 422 for unknown vs. expired tokens, and 422 when grace has already elapsed.

## Relationships

- **`tests/support/http.ts`** — `api()` supplies the HTTP client for every request; `staleBearerFor()` mints a bearer past the "critical" window.
- **`tests/support/cookies.ts`** — `cookieHeader()` / `setCookie()` extract `Set-Cookie` values for assertions.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` (called at module top) provisions a real database for the whole suite.
- **`tests/support/problem.ts`** — `withoutInstance()` strips volatile fields so two 422 bodies can be compared structurally.
- **`src/modules/users/tests/factories.ts`** — `createUser()` seeds users; `PLAIN_PASSWORD` is the known password for login.
- **`src/modules/users/repository.ts`** — `userRepository` is read (and once updated, for the grace-expiry test) to assert persisted account state.
- **`src/modules/account/config.ts`** — `deletionPurgeAt()` is the source of truth for the expected `purgeAt` value.
- **`src/modules/account/services/index.ts`** — `ACCOUNT_RESTORE_TOKEN_TYPE` identifies the restore token among a user's tokens.
- **`src/modules/account/tests/factories.ts`** — `plantToken()` seeds a token row; `tokenTypesOf()` lists surviving token types after deletion.

## Notes

- `mockOutbox` must keep the `mock` prefix: `jest.mock` is hoisted above imports and can only reference identifiers with that prefix (documented in the inline comment).
- The stale-session test relies on fake timers (`afterEach(() => jest.useRealTimers())` implies `useFakeTimers` is set inside the test via `staleBearerFor`); no other test uses fake time.
- All HTTP assertions target the wire response (status, headers, body) rather than internal service calls, by design — the module docstring states this explicitly.
- The grace-expiry test mutates the DB directly (`userRepository.updateMany`) to backdate `purgeAt`; it is the only write to the users collection in this file.
