---
source: src/modules/tasks/tests/integration/accepted-response.test.ts
sha256: aae4898a31b477bb376beb7941b29089ba86c67967c22a415cfc79c1abd2929b
generated_at: 2026-11-14T22:13:26.053689+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/tests/integration/accepted-response.test.ts

## Purpose

Integration test asserting that `POST /tasks` returns a bare `202` (no content-type header, no body) and that replaying a request with the same idempotency key reproduces that exact response without creating a second task. Exercises the real route so the idempotency ledger's capture-and-replay path is part of the assertion.

## Key elements

- **`CONTACT_PAYLOAD`** – a fixed, valid task-submission body (name, email, subject, message) shared by both tests.
- **`send()`** – helper that issues `POST /tasks` with `Idempotency-Key: contact-key-1` and the shared payload; used for the idempotency-replay test.
- **`describe('POST /tasks 202')`** – two specs:
  - *No content-type / empty body* – fires a plain POST and asserts status 202, absence of the `content-type` header, and `''` as response text.
  - *Idempotent replay* – sends the keyed request twice, polls (up to 20 × 50 ms) until the replayed response is no longer `409`, then asserts both responses are 202, the replay carries `idempotent-replayed: true`, still has no content-type / empty body, and `findAllTasks()` returns exactly one row.

## Relationships

- **`tests/support/http.ts`** – provides the `api()` request client used for every HTTP call in this file.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` is called at module load to initialise a clean test database before the suite runs.
- **`src/modules/tasks/tests/factories.ts`** – `findAllTasks()` is used in the replay test to confirm only one task row was persisted.

## Notes

- The idempotency-ledger write is fire-and-forget. The second request may briefly return `409` (conflict) while the ledger entry is still being committed; the test handles this with a bounded poll loop rather than a single retry.
- The absence of a `content-type` header is an intentional contract: the 202 response is expected to be completely empty (zero bytes), not a JSON `{}`.
