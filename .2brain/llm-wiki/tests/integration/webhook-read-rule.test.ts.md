---
source: tests/integration/webhook-read-rule.test.ts
sha256: bc72bcae61b3a9fed115fc52671f3c908f688c3296153f6f78f29f78df51d4cf
generated_at: 2026-11-15T00:23:50.194005+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/webhook-read-rule.test.ts

## Purpose

Integration test (over real HTTP) verifying that an API key holding only webhook-management permissions (`create:WebhookSubscription`, `read:WebhookSubscription`) is refused a subscription to an event it lacks a read rule for, and that the event catalogue (`GET /webhooks/events`) pre-discloses this restriction via `actions.subscribe: false`.

## Key elements

- **`inAWeek()`** – Returns an ISO timestamp 7 days out, used as the API key expiry.
- **`webhookOnlyKey()`** – Creates a user, authenticates as `admin`, mints an API key scoped to webhook permissions only, and returns the `Bearer …` header value.
- **`describe('a key holding only the webhook rules')`** – Two test cases:
  - *403 on subscribe:* POSTs `/webhooks/subscriptions` with event type `user.updated`; expects status 403 and error code `WEBHOOK_EVENT_READ_REQUIRED` naming the event.
  - *Catalogue flag:* GETs `/webhooks/events` and asserts `actions.subscribe` is `false` for `user.updated` and `order.paid`.

## Relationships

- **`src/modules/users/tests/factories.ts`** – `createUser` is called to seed a user before the admin mints the key.
- **`tests/support/http.ts`** – `api()` provides the HTTP client (Supertest-style); `authenticateAs('admin')` obtains an admin bearer token for the minting step.
- **`tests/support/body-of.ts`** – `bodyOf` parses and schema-validates response bodies against Zod validators.
- **`tests/support/contract.ts`** – Imported for side effects (contract-test globals/expectations); no named import.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` initialises a clean database before the test block runs.

## Notes

- Two-level auth is exercised: admin token mints the key, then the *minted* key is used for the SUT requests. The test does not verify admin behaviour.
- The catalogue assertion checks **two** events (`user.updated`, `order.paid`) to confirm the flag is general, not event-specific.
