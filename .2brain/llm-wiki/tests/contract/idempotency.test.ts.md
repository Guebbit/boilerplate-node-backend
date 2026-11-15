---
source: tests/contract/idempotency.test.ts
sha256: 5d8bcf5d85fe99f0f3e1a5a18cfc8a85b9fd268ca344cad0eb8e746ac1f45d99
generated_at: 2026-11-14T22:57:31.293117+00:00
model: ollama:qwen3.8:27b
---

# tests/contract/idempotency.test.ts

## Purpose
Contract (integration) test that exercises the `Idempotency-Key` HTTP middleware against a real database, driving it through the `POST /tasks` route. It verifies the three-way branch on key collision — replay, mismatch, and in-flight conflict — plus the no-key and malformed-key paths. The unit test (`tests/unit/infrastructure/http/middlewares/idempotency.test.ts`) covers pure fingerprinting logic; this file covers what actually happens on a live store.

## Key elements
- **`setupTestDb()`** — initializes a real (test) database before the suite runs.
- **`PAYLOAD`** — a fixed valid task body (`name`, `email`, `subject`, `message`) reused across cases so each test isolates the idempotency behaviour, not validation.
- **`describe('Idempotency-Key — POST /tasks')`** — six test cases:
  - *Replay success* — same key + same body → second call returns the first body verbatim, `idempotent-replayed: true`, and exactly **one** ledger row.
  - *Replay refusal* — a 422 (bad email) is replayed with its original status, `application/problem+json` media type, and body.
  - *Key mismatch* — same key, different body → 422 with `IDEMPOTENCY_KEY_MISMATCH`.
  - *In-flight conflict* — manually sets ledger state back to `in_flight`, then a second request → 409 with `IDEMPOTENCY_IN_FLIGHT`.
  - *Malformed key* — key containing a space → 422, **zero** ledger rows written.
  - *No key* — request succeeds normally, no ledger row.
- **`idempotencyRecordModel.countDocuments` / `.updateOne`** — used to assert ledger side-effects and to simulate an in-flight state.

## Relationships
- **`src/infrastructure/http/middlewares/idempotency-model.ts`** — provides `idempotencyRecordModel` (Mongoose model); this file reads and mutates it to verify/force ledger state.
- **`tests/support/contract.ts`** — side-effect import (`@tests/contract`); sets up the shared contract-test environment (app wiring, middleware registration).
- **`tests/support/http.ts`** — provides the `api()` supertest-style client used for every HTTP call in the file.
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb()` which provisions and tears down the real test database.

## Notes
- The in-flight test **manually rewrites** the ledger row's `state` back to `'in_flight'` after the first request has already completed. This is the only way to hit that branch without two genuinely concurrent sockets; the comment in the file calls this out explicitly.
- Tests assert on **ledger row count** (`countDocuments({})`) to prove exactly one (or zero) records exist, not just response shape.
- The route chosen (`POST /tasks`) is deliberately the simplest public, single-field endpoint so the test does not need to negotiate auth headers.
