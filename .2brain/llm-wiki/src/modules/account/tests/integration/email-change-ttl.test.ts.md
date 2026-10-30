---
source: src/modules/account/tests/integration/email-change-ttl.test.ts
sha256: 34430e4c69fb5077cea9382731fb8e0a4246c6ca0ab8bfde44d9e18e9dfab137
generated_at: 2026-10-29T02:55:16.097260+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/email-change-ttl.test.ts

## Purpose

Integration test that pins the time-to-live of the two links issued during an email change: the confirmation link (new address) and the undo link (old address). Rather than importing the app's own constants, it asserts against literal durations (24 h / 7 d) so the test enforces the promise made to the user in the account UI and the outgoing mail, not just internal consistency.

## Key elements

- **`HOUR_MS`** – local constant (`60 * 60 * 1000`) used to express expected lifetimes without importing app code.
- **`describe('an email change request')` → single `it`** – performs an authenticated `PATCH /account` with a new email, then reads the user's token rows and verifies:
  - `email-change` token lifetime === `24 * HOUR_MS`
  - `email-change-undo` token lifetime === `7 * 24 * HOUR_MS`
- **`beforeEach`** – sets `NODE_MAIL_TRANSPORT: 'outbox'` so no real mail is dispatched during the test.

## Relationships

- **`tests/support/http.ts`** – provides `api()` (HTTP client) and `authenticateAs('user')` (auth helper) used to issue the request and obtain the bearer token.
- **`tests/support/setup-test-db.ts`** – provides `setupTestDb()`, called at module top-level to initialise the test database before any test runs.
- **`tests/support/environment.ts`** – provides `setEnvironment()` to inject the `outbox` mail transport config per test.
- **`src/modules/account/tests/factories.ts`** – provides `tokenRowsOf(userId)` to query the tokens table for a given user, which the test uses to extract `expiresAt` and `sentAt`.

## Notes

- The test deliberately **does not** import the app's TTL constants. This is intentional: it guards against a code refactor silently changing the user-visible expiry without updating the UI or mail copy.
- Lifetime is computed as `expiresAt − sentAt`, so the assertion is about the *span* stored in the token row, not an absolute timestamp.
- The `outbox` transport value is set in `beforeEach`, meaning it is scoped per-test and does not leak into other test files.
