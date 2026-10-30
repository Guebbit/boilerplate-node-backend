---
source: tests/integration/idempotency-server-fault.test.ts
sha256: fea2dbd16138215231d19f051352aac96731d6f900abbe5c380a57c49dc4f27c
generated_at: 2026-10-29T06:55:37.181448+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/idempotency-server-fault.test.ts

## Purpose

Integration test that verifies the idempotency middleware's behavior when the route handler **faults** (returns 500). It confirms the failed response is stored and replayed for the same key without re-executing the handler, while a new key triggers a fresh execution. The test exercises this through the simplest opted-in route, `POST /tickets`.

## Key elements

- **`setupTestDb()`** — called at module top-level; initializes the test database before any test runs.
- **`PAYLOAD`** — a valid contact-message object (name, email, subject, message) that the route accepts from an unauthenticated visitor.
- **`send(key)`** — helper that issues `POST /tickets` with the given `Idempotency-Key` header and the shared `PAYLOAD`.
- **`describe('Idempotency-Key — a handler that faulted')`** — contains two tests:
  - *Same-key replay* — mocks `ticketRepository.create` to reject once, asserts the 500 is returned, the `idempotent-replay: true` header is present on retry, `create` was called exactly once, and exactly one record exists in the idempotency collection.
  - *New-key re-run* — asserts a different key causes the handler to execute again and a successful `201` produces exactly one ticket document.
- **`afterEach`** — calls `jest.restoreAllMocks()` to clean up spies between tests.

## Relationships

- **`tests/support/setup-test-db.ts`** — provides `setupTestDb`, which configures and resets the MongoDB test instance before each test suite.
- **`tests/support/http.ts`** — provides the `api()` supertest-based client used by `send()` to hit the Express app.
- **`src/modules/tickets/repository.ts`** — exports `ticketRepository`; the test spies on `create` (to simulate the fault and count invocations) and `count` (to assert how many documents were written).
- **`src/infrastructure/http/middlewares/idempotency-model.ts`** — exports `idempotencyRecordModel`; the test queries `countDocuments({})` to verify how many idempotency records were persisted.

## Notes

- The test explicitly encodes **Stripe v1 semantics**: a fault *is* stored, and a retry under the same key re-sends the 500. This is intentional — the frontend is expected to spend a key on any non-network, non-`409` response.
- The `idempotent-replay: true` response header is the contract that lets a client distinguish a replayed failure from a fresh one.
- `jest.restoreAllMocks()` is the sole teardown; there is no explicit cleanup of the idempotency collection (the test DB is reset per suite by `setupTestDb`).
- The module-level doc comment links to `docs/tools/idempotency.md#what-a-failure-stores` for the design rationale.
