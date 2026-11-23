---
source: src/modules/account/tests/integration/delete-account.test.ts
source_sha256: 4fdf58875912c6d9e5bc9380a8ae76b7ca9f22ed965647753d2d934787b02847
context_sha256: eee20c4d279246d19482862bd4de8756814b85ffd8cc405bafcc842c1abcdce1
generated_at: 2026-11-22T03:53:46.690943+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/integration/delete-account.test.ts

## Purpose
HTTP-level integration tests for account self-deletion with a grace period. They cover `DELETE /account` (locks the account immediately and answers 202) and `POST /account/restore` (spends the mailed restore link within the grace). They assert the statuses and bodies a real caller receives. Audit and analytics rows, mail copy and the purge itself are tested in separate suites.

## Key elements
- `mockOutbox`: array collecting every mail the app queues (`template`, `data`). It is named `mock*` so the hoisted `jest.mock` factory may close over it. It is cleared in `beforeEach`.
- `jest.mock('@infrastructure/adapters/mailer')`: keeps the real module but replaces `enqueueEmail` with a stub that pushes to `mockOutbox`.
- `setupTestDb()`: sets up the test database.
- `authenticate(email?)`: creates a verified user, logs in through `/account/login`, and returns `{ user, bearer, cookie }`. The cookie is the `__Host-session` refresh cookie.
- `mailedRestoreToken()`: finds the `account.deletion-scheduled` mail and extracts the `token` from the hash fragment of its `linkUrl`.
- `scheduled(email?)`: calls `DELETE /account` and returns the user and the mailed token.
- `describe('DELETE /account')`:
  - Answers 202 with `requestedAt` and `purgeAt`. `purgeAt` must equal `deletionPurgeAt(requestedAt)`.
  - The stored user gets `deletedBy: 'owner'` and a matching `purgeAt`. Exactly one `account.deletion-scheduled` mail is queued.
  - Session cookies are cleared, and the bearer and refresh cookie both return 401. A later login returns `deletionPending: true` and sets no session cookie.
  - Pending tokens are purged, leaving only the `ACCOUNT_RESTORE_TOKEN_TYPE` token.
  - A session past the `critical` window gets 401 `REAUTH_REQUIRED`. Nothing is mailed and `deletedAt` stays unset.
- `describe('POST /account/restore')`:
  - Answers 204 with no `Set-Cookie`. `deletedAt` and `purgeAt` are cleared and an `account.restored` mail is queued. A normal login then returns 200.
  - A reused link gets 422.
  - An unknown token and an expired token both get 422 with the same body once `withoutInstance` has normalized them.

## Relationships
- `src/modules/account/config.ts`: supplies `deletionPurgeAt`, used to compute the expected `purgeAt`.
- `src/modules/account/services/index.ts`: supplies `ACCOUNT_RESTORE_TOKEN_TYPE`, used to check the remaining token type and to plant an expired restore token.
- `src/modules/account/tests/factories.ts`: supplies `plantToken` and `tokenTypesOf` for seeding and inspecting tokens.
- `src/modules/users/tests/factories.ts`: supplies `createUser`, `PLAIN_PASSWORD` and `userRepository`.
- `src/modules/users/repository.ts`: this file does not import it directly. It reads stored users through the `userRepository` re-exported from the users test factories.
- `tests/support/http.ts`: supplies `api()` and `staleBearerFor`, which builds a bearer past the critical window.
- `tests/support/cookies.ts`: supplies `cookieHeader` and `setCookie` for the session cookie.
- `tests/support/problem.ts`: supplies `withoutInstance`, which normalizes error bodies for comparison.
- `tests/support/setup-test-db.ts`: supplies `setupTestDb`.

## Notes
- The mailer is mocked, so mail assertions check the template name and data passed to `enqueueEmail`. No mail is actually sent.
- `jest.useRealTimers()` runs in `afterEach` only inside the stale-session block.
- The two `scheduled`/`mockOutbox.length = 0` steps in the restore test make sure only the restore mail is asserted.
