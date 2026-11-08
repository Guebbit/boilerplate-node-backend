---
source: src/modules/account/tests/integration/delete-account.test.ts
sha256: 654d6a3570143788e774cf0424e8cba344d493d2f784357f3ee4136f8027f71a
generated_at: 2026-11-08T04:35:26.640586+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/delete-account.test.ts

## Purpose

Integration tests for the self-deletion HTTP contract: `DELETE /account` (locks the account, returns 202 with two dates, mails a restore link, invalidates sessions) and `POST /account/restore` (spends the mailed token to cancel the deletion). The tests assert what a real caller receives over HTTP—status codes, response bodies, `Set-Cookie` headers, and persisted account state—rather than internal collaborator behavior.

## Key elements

- **`mockOutbox`** — Array capturing every email the (mocked) mailer queues. Must carry the `mock` prefix because `jest.mock` hoists above imports and may only close over identifiers with that prefix.
- **`jest.mock('@infrastructure/adapters/mailer')`** — Replaces `enqueueEmail` with a spy that pushes `{ template, data }` into `mockOutbox` and resolves.
- **`authenticate(email?)`** — Creates a verified user via `createUser`, performs a real `POST /account/login`, and returns `{ user, bearer, cookie }`.
- **`mailedRestoreToken()`** — Locates the `account.deletion-scheduled` email in `mockOutbox` and extracts the `token` hash-param from its `linkUrl`.
- **`scheduled(email?)`** — Convenience: authenticates, issues `DELETE /account`, returns `{ user, token }` for restore-flow tests.
- **`describe('DELETE /account')`** — Verifies 202 + dates, account lock (`deletedBy: 'owner'`, `purgeAt`), mail sent, session cookies cleared, all refresh sessions killed, pending tokens purged, and the 401 `REAUTH_REQUIRED` path for a stale (past-critical-window) bearer.
- **`describe('POST /account/restore')`** — Verifies 204 cancel + confirmation mail, single-use token (422 on replay), unknown/expired token both yield identical 422, and an expired grace (`purgeAt` in the past) keeps the account locked even with a valid link.

## Relationships

- **`src/modules/account/config.ts`** — Imports `deletionPurgeAt` to assert the `purgeAt` in the 202 body matches the configured grace calculation.
- **`src/modules/account/services/index.ts`** — Imports `ACCOUNT_RESTORE_TOKEN_TYPE` to identify the restore token when asserting remaining token types after deletion.
- **`src/modules/account/tests/factories.ts`** — Imports `plantToken` (insert a token row) and `tokenTypesOf` (list token types for a user) for token-state assertions.
- **`src/modules/users/repository.ts`** — Imports `userRepository` to read/verify persisted account fields (`deletedBy`, `purgeAt`, `deletedAt`) and to overwrite `purgeAt` for the expired-grace test.
- **`src/modules/users/tests/factories.ts`** — Imports `createUser` and `PLAIN_PASSWORD` to provision test accounts.
- **`tests/support/cookies.ts`** — Imports `cookieHeader` (extract `__Host-session` from a login response) and `setCookie` (check whether a response sets that cookie).
- **`tests/support/http.ts`** — Imports `api` (request helper) and `staleBearerFor` (mint a bearer that fails the `critical` freshness check).
- **`tests/support/problem.ts`** — Imports `withoutInstance` to strip the `instance` field before comparing two 422 error bodies for equality.
- **`tests/support/setup-test-db.ts`** — Calls `setupTestDb()` once at module level to prepare the test database.

## Notes

- The module doc block explicitly scopes this file to the HTTP surface; audit rows, analytics, mail copy, and the purge job each live in their own suites.
- The expired-grace test mutates `purgeAt` directly in the DB (`updateMany`) to simulate elapsed time rather than using fake timers, keeping the real clock for everything else.
- `staleBearerFor(user, 'critical')` produces a token whose freshness falls outside the `critical` window, triggering the 401 path without needing fake timers.
- The `beforeEach` resets `mockOutbox.length = 0` so each test starts with a clean mail expectation; the restore "cancels" test additionally clears it mid-test before asserting the confirmation mail.
