---
source: tests/integration/idempotency-server-fault.test.ts
sha256: 9d96133f9c11aec3dade11c502adfb6592dc4c99a37bae4571d8e87985156397
generated_at: 2026-11-14T23:14:00.092221+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/idempotency-server-fault.test.ts

## Purpose

Integration test verifying what the idempotency middleware does when the route handler **faults** (returns 500). It asserts the Stripe v1 rule: a 500 response is stored and replayed for retries under the same `Idempotency-Key` without re-executing the handler, while a different key triggers a fresh execution. Driven through the simplest opted-in route, `POST /tasks`.

## Key elements

- **`setupTestDb()`** — initialises an isolated MongoDB instance for the test process (called once at module level).
- **`PAYLOAD`** — a valid contact-message body that `POST /tasks` accepts from an anonymous visitor.
- **`send(key)`** — small helper that issues `POST /tasks` with the given `Idempotency-Key` header via the test HTTP client.
- **`afterEach` → `jest.restoreAllMocks()`** — resets all spies between tests.
- **Test 1: "stores the 500 and replays it…"** — mocks `taskRepository.create` to reject once; asserts the first call yields 500, the same-key retry yields 500 + `idempotent-replayed: true`, the repository is still called exactly once, and exactly one document exists in the idempotency store.
- **Test 2: "runs the handler again under a NEW key…"** — same fault setup; asserts a second key gets a 202 and the tasks collection contains exactly one document (the failed attempt did **not** write).

## Relationships

- **`tests/support/setup-test-db.ts`** — provides `setupTestDb`, which spins up the MongoDB instance all other tests in the file depend on.
- **`tests/support/http.ts`** — provides the `api` helper (a `supertest`-like client) used to issue requests against the running app.
- **`src/modules/tasks/repository.ts`** — `taskRepository` is spied on to simulate the 500 fault (`mockRejectedValueOnce`) and to verify write counts.
- **`src/infrastructure/http/middlewares/idempotency-model.ts`** — `idempotencyRecordModel` is queried (`countDocuments`) to confirm exactly one idempotency record was persisted.

## Notes

- The fault is simulated with `mockRejectedValueOnce`, so only the **first** call rejects; any subsequent call through the same mock would resolve. This is deliberate: the middleware short-circuits the second call before the repository is reached.
- The test relies on the `idempotent-replayed` response header being set to the string `'true'` (not boolean) on replayed responses.
- A 202 (not 200/201) is the expected success status for `POST /tasks`, reflecting async task-creation semantics.
- The file-header comment cross-references `docs/tools/idempotency.md#what-a-failure-stores` for the design rationale.
