---
source: tests/contract/idempotency.test.ts
sha256: 3f4b1d2157521bb8ac088cb7910a0c18e04b6c1e8abfcd0cddce4699a3e89ade
generated_at: 2026-09-23T19:51:50.205412+00:00
model: ollama:qwen3.8:27b
---

# tests/contract/idempotency.test.ts

## Purpose
Contract test exercising the `Idempotency-Key` middleware's three-way branching logic (replay, mismatch, in-flight) against a real database. It drives the simplest opted-in route — `POST /feedback/contact` (public, single-field, no auth) — to verify ledger behaviour and response shapes without fighting authentication. Complements the pure-fingerprinting unit test in `tests/unit/infrastructure/http/middlewares/idempotency.test.ts`.

## Key elements
- **`setupTestDb()`** — called at module load; provisions a real (ephemeral) database for the suite.
- **`PAYLOAD`** — shared request body (name/email/subject/message) used across all test cases.
- **`describe('Idempotency-Key — POST /feedback/contact')`** — five test cases:
  - *Replay* — same key + same body → 201, `idempotent-replay: true` header, identical body, exactly one ledger row.
  - *Mismatch* — same key + different body → 422, error code `IDEMPOTENCY_KEY_MISMATCH`.
  - *In-flight* — same key while record is in `in-flight` state → 409, error code `IDEMPOTENCY_IN_FLIGHT`.
  - *Malformed key* — key containing a space → 422, zero ledger rows written.
  - *No key* — request without the header → 201, zero ledger rows.

## Relationships
- **`src/infrastructure/http/middlewares/idempotency-model.ts`** — imports `idempotencyRecordModel` to assert ledger row counts directly and to force a record's `state` back to `'in-flight'` (simulating a race that two sequential HTTP calls cannot produce).
- **`tests/support/contract.ts`** — side-effect import; registers the `toSatisfyApiSpec()` matcher used in every assertion.
- **`tests/support/http.ts`** — provides the `api()` helper for issuing HTTP requests against the running server.
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb()` to create/seed the real database before tests run.

## Notes
- The in-flight test **mutates the ledger directly** (`idempotencyRecordModel.updateOne`) to force `state: 'in-flight'` after the first request has already completed. This is the only way to reach that branch without spawning two truly concurrent sockets.
- The route `POST /feedback/contact` is deliberately chosen because it is public and single-field; no auth token or complex body is needed.
- Every response assertion is followed by `toSatisfyApiSpec()` to enforce the shared API envelope contract.
- Tests assume a clean ledger per case; they rely on the test DB being fresh (no isolation helper is visible in the file).
