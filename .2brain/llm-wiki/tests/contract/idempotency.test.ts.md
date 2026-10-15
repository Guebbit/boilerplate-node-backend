---
source: tests/contract/idempotency.test.ts
sha256: d46d5c4a4ea0ab09bc00f65ffed1c4171b5826d967382ba8a78a9e6afe92111e
generated_at: 2026-10-15T12:32:23.176388+00:00
model: ollama:qwen3.8:27b
---

# tests/contract/idempotency.test.ts

## Purpose

Integration (contract) test that drives the `Idempotency-Key` middleware through real HTTP requests against a live database, using `POST /feedback/contact` as the target route. It verifies the three runtime branches of the middleware — replay, key/body mismatch, and in-flight collision — plus two edge cases (malformed key, absent key). The unit test at `tests/unit/infrastructure/http/middlewares/idempotency.test.ts` covers pure fingerprinting logic; this file covers the observable three-way decision against a persisted ledger.

## Key elements

- **`PAYLOAD`** – Fixed fixture object (`name`, `email`, `subject`, `message`) used as the request body across all tests.
- **`setupTestDb()`** – Called at module scope; provisions a real database for the suite.
- **Test: "replays the first response verbatim…"** – Sends the same key + body twice; asserts second response is `201`, carries `idempotent-replay: true`, has identical body, and that exactly one ledger row and one feedback record exist.
- **Test: "answers 422 when the same key is reused with a different body"** – Same key, mutated `subject`; expects `422` with error code `IDEMPOTENCY_KEY_MISMATCH`.
- **Test: "answers 409 while a request with the same key is still in flight"** – Manually flips the ledger row to `state: 'in-flight'` after the first request completes, then retries; expects `409` with error code `IDEMPOTENCY_IN_FLIGHT`.
- **Test: "rejects a malformed key before writing to the ledger"** – Key containing a space; expects `422` and zero ledger rows.
- **Test: "runs normally, with no ledger row at all, when no key is sent"** – Omits the header entirely; expects `201` and zero ledger rows.

## Relationships

- **`src/infrastructure/http/middlewares/idempotency-model.ts`** – Exports `idempotencyRecordModel`, used here to (a) assert row counts via `countDocuments` and (b) force the `in-flight` state via `updateOne` to simulate a concurrent race.
- **`tests/support/contract.ts`** – Imported for side effects; sets up global contract-test configuration (e.g. app instance, test hooks).
- **`tests/support/http.ts`** – Provides the `api()` supertest-style client used to issue requests.
- **`tests/support/setup-test-db.ts`** – Provides `setupTestDb()` to create and tear down a real database instance for the suite.

## Notes

- The **in-flight** test cannot use two truly concurrent sockets; instead it completes the first request, then mutates the DB row back to `state: 'in-flight'` before issuing the second request. This is the only way to exercise that branch without a dedicated concurrency harness.
- The route was chosen deliberately: `POST /feedback/contact` is public and single-field, so tests don't need to handle auth, tokens, or role checks.
- The `idempotent-replay: true` response header is the observable signal that a stored response was returned rather than the handler re-executing.
