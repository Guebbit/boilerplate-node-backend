---
source: src/modules/account/tests/integration/email-change-ttl.test.ts
sha256: 34430e4c69fb5077cea9382731fb8e0a4246c6ca0ab8bfde44d9e18e9dfab137
generated_at: 2026-11-08T04:36:00.076154+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/email-change-ttl.test.ts

## Purpose

Integration test that verifies the expiration durations of the two tokens issued during an email-change request: the confirmation link (24 hours) and the undo link (7 days). It asserts against **literal** millisecond values rather than importing the app's TTL constants, so the test fails if the code drifts from the durations the UI and outbound mail promise.

## Key elements

- **`HOUR_MS`** — local constant (`3 600 000`) used to express expected lifetimes.
- **`lifetimeOf(type)`** — small helper (defined inside the test) that finds a token row by `type` and returns `expiresAt − sentAt` in ms.
- **Single test case** — authenticates as a user, `PATCH /account` with a new email, then queries the token table and asserts:
  - `email-change` row lifetime equals `24 × HOUR_MS`
  - `email-change-undo` row lifetime equals `7 × 24 × HOUR_MS`

## Relationships

- **`tests/support/setup-test-db.ts`** — `setupTestDb()` (called once at module level) provisions and resets the test database before the suite runs.
- **`tests/support/environment.ts`** — `setEnvironment({ NODE_MAIL_TRANSPORT: 'outbox' })` in `beforeEach` ensures mail is captured, not sent.
- **`tests/support/http.ts`** — `api()` builds the HTTP client used for the `PATCH /account` request; `authenticateAs('user')` returns a user fixture and a bearer token.
- **`src/modules/account/tests/factories.ts`** — `tokenRowsOf(userId)` queries the token table so the test can inspect `type`, `sentAt`, and `expiresAt` directly.

## Notes

- The module doc comment explicitly states the durations are "pinned against literal durations, not the constants the code reads." If you change the TTL constants in application code, this test will fail until the literals are updated to match — that is intentional.
- `setupTestDb()` runs at import time (top-level), not inside `beforeEach`; the environment override does run per-test.
- Only the `outbox` transport is exercised; there is no assertion on mail content or delivery.
