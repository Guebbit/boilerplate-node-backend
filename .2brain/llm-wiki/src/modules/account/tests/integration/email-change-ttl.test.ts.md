---
source: src/modules/account/tests/integration/email-change-ttl.test.ts
sha256: a09bcd8d4baa5089bf2bccdb23628b529e81a729da89b46d8ce21ee91798df7d
generated_at: 2026-11-14T19:02:35.710593+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/email-change-ttl.test.ts

## Purpose

Integration test that pins the user-facing TTLs of the two tokens issued by an email-change request: the confirmation link (24 h) and the undo link (7 days). The durations are asserted against **literal** millisecond values rather than the constants the production code reads, so the test guards the promise made on the account page and in the mail, not internal consistency.

## Key elements

- **`HOUR_MS`** — local constant (3 600 000 ms) used to build the expected durations.
- **`describe('an email change request')` / `it(…)`** — the single test case. Authenticates as a user, POSTs to `/account/email-change`, then inspects the token rows for that user and asserts `expiresAt − sentAt` equals `24 * HOUR_MS` for `email-change` and `7 * 24 * HOUR_MS` for `email-change-undo`.
- **`beforeEach`** — forces `NODE_MAIL_TRANSPORT` to `'outbox'` so no real mail is sent.

## Relationships

- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module scope to provision a clean database before the suite runs.
- **`tests/support/environment.ts`** — `setEnvironment()` overrides the mail-transport setting per test.
- **`tests/support/http.ts`** — `api()` provides the HTTP client for the POST; `authenticateAs('user')` creates a user and returns a bearer token.
- **`src/modules/account/tests/factories.ts`** — `tokenRowsOf(userId)` queries the token table and returns the stored rows (with `type`, `sentAt`, `expiresAt`), which the test inspects.

## Notes

- The test intentionally avoids importing the production TTL constants. If the constants change, this test will fail, forcing a conscious decision about the user-facing promise.
- Lifetime is derived as `expiresAt − sentAt` (both stored on the token row), so it is independent of when the assertion runs.
- Only one user (`'user'`) is exercised; there is no multi-user or re-request scenario.
