---
source: src/modules/account/tests/integration/email-change-ttl.test.ts
source_sha256: a09bcd8d4baa5089bf2bccdb23628b529e81a729da89b46d8ce21ee91798df7d
context_sha256: eb19fd740bfda4becffa6e97e0c93b0edbbc9399094954b871ab9d2f99b8bfe2
generated_at: 2026-11-22T03:54:36.062118+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/integration/email-change-ttl.test.ts

## Purpose
Integration test that pins the lifetimes of the two tokens issued when a user requests an email change: the confirmation link sent to the new address and the undo link sent to the old one. Durations are asserted against literal values (24 hours and 7 days) rather than the constants the production code reads, so the test reflects what the account page and mail promise to users.

## Key elements
- `HOUR_MS`: local constant, one hour in milliseconds, used to express the expected lifetimes.
- `describe('an email change request')` with a single test: authenticates as a `'user'`, POSTs `/account/email-change` with `{ email: 'new@example.com' }`, expects a 200, then reads the user's token rows.
- `lifetimeOf(type)`: local helper that finds the token row of a given type and returns `expiresAt - sentAt` in milliseconds (or `undefined` if no such row exists).
- Assertions:
  - `email-change` token lifetime is `24 * HOUR_MS`.
  - `email-change-undo` token lifetime is `7 * 24 * HOUR_MS`.
- `beforeEach` sets `NODE_MAIL_TRANSPORT` to `'outbox'` via `setEnvironment`.

## Relationships
- `src/modules/account/tests/factories.ts`: supplies `tokenRowsOf(userId)`, which returns the user's token rows from which lifetimes are computed.
- `tests/support/http.ts`: supplies `api()` (the HTTP client used for the request) and `authenticateAs('user')` (returns the `user` and a `bearer` Authorization value).
- `tests/support/setup-test-db.ts`: `setupTestDb()` is called at module level to set up the test database.
- `tests/support/environment.ts`: `setEnvironment` is used to configure the mail transport per test.

## Notes
- Lifetimes are measured as `expiresAt - sentAt` on the stored rows, so the test depends on both timestamps being set on the token rows.
- If a token type is missing from the rows, `lifetimeOf` returns `undefined` and the assertion fails.
- The literal durations are deliberate: changing the production constants should require updating this test.
