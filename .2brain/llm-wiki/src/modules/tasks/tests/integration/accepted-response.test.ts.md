---
source: src/modules/tasks/tests/integration/accepted-response.test.ts
sha256: 08aef03e6c96f6e7aac3154c03c1c73d6097d14c8f48232ba0a7539e94f27717
generated_at: 2026-11-08T08:38:17.803812+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/tests/integration/accepted-response.test.ts

## Purpose

Integration test for `POST /tasks` that asserts the 202 Accepted response carries **no** `content-type` header and an empty body, and that a repeated request with the same idempotency key is replayed identically (202, `idempotent-replay: true`) without creating a second task. Runs through the real route so the idempotency ledger's capture-and-replay path is exercised.

## Key elements

- **`CONTACT_PAYLOAD`** – Static valid contact-message body (name, email, subject, message) reused by both tests.
- **`send()`** – Helper that issues `POST /tasks` with a fixed `Idempotency-Key: contact-key-1` and the shared payload.
- **`describe('POST /tasks 202')`** – The test suite containing two cases:
  - *"carries no content-type header and an empty body"* – Sends without an idempotency key and asserts `202`, absence of `content-type`, and `''` body.
  - *"replays a repeated idempotent request…"* – Sends twice with the same key; polls up to 20 × 50 ms while the response is `409` (ledger not yet committed), then asserts `202` on both, `idempotent-replay: true` on the second, no `content-type`, empty body, and exactly **1** row in the tasks table.

## Relationships

- **`tests/support/http.ts`** – Supplies the `api()` request helper used for every HTTP call in this file.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` is called at module level to provision a clean test database before the suite runs.
- **`src/modules/tasks/tests/factories.ts`** – `findAllTasks()` is called in the replay test to confirm only one task row was persisted.

## Notes

- The idempotency-ledger write is **fire-and-forget**; the replay test must poll (409 → 202) because the ledger commit can lag the initial response. The 20 × 50 ms loop is the only synchronization mechanism—no event or callback is awaited.
- The absence of `content-type` on a 202 is intentional and is asserted with `not.toHaveProperty('content-type')`, not a check for a specific value. This is a contract of the endpoint, not a supertest default.
- `setupTestDb()` runs once at module scope (outside `describe`), so the DB is fresh for the entire file but shared across the two tests.
