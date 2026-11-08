---
source: tests/contract/idempotency.test.ts
sha256: 261ca6d83c52e71c7a600daaea7748492847420d258eecae1d6c7c4cff308839
generated_at: 2026-11-08T09:19:20.559410+00:00
model: ollama:qwen3.8:27b
---

# tests/contract/idempotency.test.ts

## Purpose

Integration test for the `Idempotency-Key` middleware, exercised against a real database through `POST /tasks` (chosen as the simplest opted-in route: public, single-field, no auth friction). It covers the three-way branch on key collision—replay, mismatch, and in-flight conflict—that the unit test (`tests/unit/…/idempotency.test.ts`, which covers pure fingerprinting logic) cannot reach.

## Key elements

- **`PAYLOAD`** – constant body (task name/email/subject/message) reused across all tests so only the `Idempotency-Key` header or a single mutated field varies.
- **`describe('Idempotency-Key — POST /tasks')`** – six cases:
  - *Replay on repeat* – same key + same body → second call returns identical 202 body, `idempotent-replay: true`, and exactly **1** ledger row / 1 task.
  - *Replay a refusal* – same key + invalid email → both calls 422 `application/problem+json`; second carries the replay header.
  - *Key mismatch* – same key, different body → 422 with error code `IDEMPOTENCY_KEY_MISMATCH`.
  - *In-flight conflict* – key already `done`, manually flipped back to `in_flight` → 409 with `IDEMPOTENCY_IN_FLIGHT`.
  - *Malformed key* – header value `'has a space'` → 422, **zero** ledger rows written.
  - *No key sent* – 202, zero ledger rows; middleware is a no-op.

## Relationships

- **`src/infrastructure/http/middlewares/idempotency-model.ts`** – imports `idempotencyRecordModel` to assert ledger state (`countDocuments`) and to force the `in_flight` state for the 409 test.
- **`tests/support/http.ts`** – provides the `api()` helper (Supertest-wrapped client) used for every HTTP call.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` is called at module top to provision and isolate a real MongoDB instance before any test runs.
- **`tests/support/contract.ts`** – imported as a side-effect module (`import '@tests/contract'`); sets up shared contract-test conventions (e.g., response-type assertions) for the whole suite.

## Notes

- The **in-flight (409)** case is the only branch unreachable via normal sequential HTTP. The test cheats by resetting the record's `state` to `in_flight` after the first request completes, simulating a true race without two concurrent sockets.
- The **malformed-key** test asserts that validation happens *before* any ledger write (`countDocuments` stays 0), guarding against orphaned rows.
- `@tests/contract` is a bare side-effect import—no named bindings are pulled. Remove it and shared assertion helpers (e.g., `.type()` on the response) will not be available.
- All tests run against a real database (not mocks); there is no in-memory fallback. Ensure the test DB is available in CI.
