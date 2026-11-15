---
source: tests/integration/idempotency-caller-scope.test.ts
sha256: 5000581f0a1dba61bdd5561298f4a2bc70d2f85ab6bee9920f5df458e0ec855f
generated_at: 2026-11-14T23:13:47.960339+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/idempotency-caller-scope.test.ts

## Purpose

Integration test verifying that an `Idempotency-Key` is scoped to its caller: when a *different* caller reuses the same key with the same body, the request is treated as a fresh execution rather than a replay of the first caller's stored response. This guards against a subtle security/correctness bug where one caller's idempotency record could silently suppress another caller's request.

## Key elements

- **`PAYLOAD`** – Shared request body (task creation fields) so the only variable between requests is the caller identity.
- **`KEY`** (`'shared-key-1'`) – The single idempotency key deliberately reused across different callers.
- **`describe('Idempotency-Key — scoped per caller')`** – Two test cases:
  - *Two signed-in callers*: Alice (`user`) and Bob (`admin`) both `POST /tasks` with the same key and body. Both must return `202`, neither sets `idempotent-replayed`, and the DB must contain 2 task rows and 2 idempotency records for that key.
  - *Signed-in vs. anonymous*: Alice uses the key first; an unauthenticated request reusing it must also run fresh (no replay header), and a second idempotency record is stored.

## Relationships

- **`src/infrastructure/http/middlewares/idempotency-model.ts`** – Imports `idempotencyRecordModel` to query stored idempotency records and assert that a separate record exists per caller rather than a single shared record.
- **`src/modules/tasks/repository.ts`** – Imports `taskRepository` to confirm both callers actually created task rows (no replay swallowed the second insert).
- **`tests/support/http.ts`** – Provides `api()` (a Supertest instance against the app) and `authenticateAs(role)` which returns a bearer token for a seeded user.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` is called once at module load to provision a clean database before the suite runs.

## Notes

- Supertest sends all requests from a single IP, so IP-based caller scoping would not differentiate callers. The test deliberately relies on the **account id** (or absence thereof for anonymous) as the caller discriminator.
- The `idempotent-replayed` response header is the observable signal that a replay occurred; its *absence* is the assertion that the request was treated as new.
- Both tests assert a count of **2** idempotency records for the same key, confirming the model keys on `(key, caller)` rather than `key` alone.
