---
source: tests/integration/idempotency-server-fault.test.ts
sha256: b63ea502535422c650fcb12dcdd5d7528acf9fef3725b3d4d0adb1407450bd13
generated_at: 2026-11-08T09:38:53.370223+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/idempotency-server-fault.test.ts

## Purpose

Integration test that verifies what happens to an `Idempotency-Key` after the handler faults (500). It asserts the Stripe v1 replay rule: a retry under the same key re-sends the stored failure without re-executing the handler, while a new key triggers a fresh run. Exercises this through the simplest opted-in route, `POST /tasks`.

## Key elements

- **`PAYLOAD`** – A valid contact-message body the `POST /tasks` route accepts from an unauthenticated visitor.
- **`send(key)`** – Helper that issues `POST /tasks` with the given `Idempotency-Key` header and the shared payload.
- **`"stores the 500 and replays it for the same key"`** – Mocks `taskRepository.create` to reject once, sends the same key twice, and asserts: second response is 500 with `idempotent-replay: true` header, `create` was called exactly once, and one idempotency record exists.
- **`"runs the handler again under a NEW key"`** – Faults under one key, then sends a different key; asserts the second call succeeds (202) and exactly one document is written.

## Relationships

- **`tests/support/setup-test-db.ts`** – Calls `setupTestDb()` at module level to provision a clean database for the tests.
- **`tests/support/http.ts`** – Provides the `api()` helper used to issue the HTTP requests.
- **`src/modules/tasks/repository.ts`** – Imports `taskRepository` and spies on its `create` method to simulate a handler fault (`mockRejectedValueOnce`).
- **`src/infrastructure/http/middlewares/idempotency-model.ts`** – Imports `idempotencyRecordModel` to assert the stored record count via `countDocuments`.

## Notes

- Each test uses `mockRejectedValueOnce` (singular) rather than `mockRejectedValue`; only the *first* call faults. This is intentional: it models a one-off server hiccup, not a persistent outage.
- `afterEach` calls `jest.restoreAllMocks()`, so spies do not leak between tests.
- The `idempotent-replay: true` response header is the client-facing signal that the response was replayed rather than freshly computed.
