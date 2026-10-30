---
source: tests/contract/idempotency.test.ts
sha256: 7864b58adc833f289c6eb8d6980e485769116d52cf1ed90389a2fcdff52b0110
generated_at: 2026-10-29T06:38:48.856747+00:00
model: ollama:qwen3.8:27b
---

# tests/contract/idempotency.test.ts

## Purpose

Integration test that exercises the `Idempotency-Key` middleware against a real database through `POST /tickets`. It verifies the three observable branches — successful replay, replayed refusal, and key-mismatch/conflict — plus the edge cases of malformed keys and absent keys. Complements the pure-logic unit test in `tests/unit/…/idempotency.test.ts` by covering the full HTTP + DB round-trip.

## Key elements

- **`PAYLOAD`** — fixed ticket payload used as the "same body" reference across tests.
- **`replays the first response verbatim…`** — same key + body → 201, `idempotent-replay: true`, identical body, exactly one ledger row.
- **`replays a refusal as the problem…`** — same key + invalid body → 422 `application/problem+json` replayed verbatim.
- **`answers 422 when the same key is reused with a different body`** — asserts `IDEMPOTENCY_KEY_MISMATCH` error code.
- **`answers 409 while a request with the same key is still in flight`** — asserts `IDEMPOTENCY_IN_FLIGHT` error code.
- **`rejects a malformed key before writing to the ledger`** — space in key → 422, zero ledger rows.
- **`runs normally… when no key is sent`** — 201, zero ledger rows.
- **`setupTestDb()`** — top-level call to provision an isolated test database.

## Relationships

- **`src/infrastructure/http/middlewares/idempotency-model.ts`** — imports `idempotencyRecordModel` to assert ledger row counts and to force a record's `state` back to `'in-flight'` (simulating a race condition).
- **`tests/support/contract.ts`** — side-effect import (no named bindings); likely registers shared contract-test assertions or expectations.
- **`tests/support/http.ts`** — imports the `api` helper that builds the supertest request agent against the app.
- **`tests/support/setup-test-db.ts`** — imports `setupTestDb` to connect the test suite to a clean database instance.

## Notes

- The in-flight test mutates the ledger directly (`updateOne … { state: 'in-flight' }`) because a true concurrent test would require two live sockets racing; this is the only branch not naturally reachable via sequential HTTP calls.
- `POST /tickets` was chosen deliberately as the simplest opted-in route (public, single-resource) so the test doesn't need auth setup.
- `@tests/contract` is imported purely for side effects; there is no destructured binding from it.
