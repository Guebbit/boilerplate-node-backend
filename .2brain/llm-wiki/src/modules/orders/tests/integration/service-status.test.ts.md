---
source: src/modules/orders/tests/integration/service-status.test.ts
sha256: cae8c4b0d4eb74bfb55296f7b2def3033ab9c6f2231e3778e6bc39eca538baf1
generated_at: 2026-11-08T07:10:24.567234+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/service-status.test.ts

## Purpose

Integration test suite for the order-status transition doors in `services/status.ts`. Runs against a **real MongoDB** instance to verify that conditional writes (`$in` filter), domain-event emission, deadline stamping, transactional atomicity, and concurrent-race correctness all hold together. The module-level doc comment states the rationale explicitly: a mock cannot race against itself, so the race and conditional-write guarantees are only observable with a live database.

## Key elements

- **`setupTestDb()`** — called once at module top level; spins up an in-memory (or local) Mongo instance for every test in the file.
- **`beforeEach` / `afterEach` hooks** — wire and reset the domain-event bus (`markDomainEventsWired` / `resetDomainEvents`) so each test gets a clean subscriber list.
- **`describe('markPaid')`** — verifies `pending → paid` transition, `paidAt` stamping in the same write, event emission, and refusal from `paid`, `processing`, `canceled`.
- **`describe('markProcessing')`** — verifies `paid → processing`, refusal from `pending`, and that the door is also reachable via the `orderService` facade.
- **`describe('markShipped')`** — verifies `processing → shipped` and refusal from `paid`.
- **`describe('markDelivered')`** — verifies `shipped → delivered`, refusal from `processing`, `withdrawUntil` (30-day withdrawal) and `conformityUntil` (2-year guarantee) deadline computation, and a `NODE_WITHDRAWAL_PERIOD_DAYS` environment-override variant.
- **`inTransaction` (local helper)** — thin wrapper around `withTransaction` that accepts a door function receiving a `ClientSession`; used by all session-variant door tests.
- **`describe('markFulfillmentComplete')`** — covers the physical path (processing → shipped → delivered in one write, two events), the digital-only path (processing → delivered, clock from `paidAt`), refusal from `paid`/`shipped`/`delivered`, and rollback (a later write failure inside the caller's transaction undoes the door's effect and leaves zero outbox documents).
- **`describe('the doors that take the caller's session')`** — asserts that session-variant doors (`markShipped`, `markDelivered`) are invisible to other reads until the caller's transaction commits, and that the outbox document is written within the same transaction.
- **`describe('two callers racing the same move')`** — fires two concurrent `markPaid` calls with `Promise.all`; expects exactly one to succeed and exactly one event to be emitted (test body truncated in the provided excerpt).

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/orders/services/status.ts` | **SUT** — imports `markPaid`, `markProcessing`, `markShipped`, `markDelivered`, `markFulfillmentComplete`. |
| `src/modules/orders/services/index.ts` | Imports `orderService` to verify the doors are reachable on the service facade. |
| `src/modules/orders/events.ts` | Imports `ORDER_STATUS_CHANGED` to subscribe to and assert on emitted domain events. |
| `src/kernel/events.ts` | Uses `markDomainEventsWired`, `onDomainEvent`, `resetDomainEvents` for event-bus lifecycle per test. |
| `src/kernel/outbox.ts` | Uses `nudgeOutbox` (wakes the relay after a session-variant commit), `settleOutboxNudges` (awaits delivery before asserting), and `outboxEventModel.countDocuments` (asserts zero or one outbox row). |
| `src/modules/orders/tests/factories.ts` | Uses `seedOrder`, `seedDigitalOrder`, `readOrder` to create and re-read fixtures in the real DB. |
| `src/types/index.ts` | Imports `OrderStatus` enum for seeding, assertions, and `it.each` parameterisation. |
| `tests/support/setup-test-db.ts` | Calls `setupTestDb()` at module scope to initialise the shared test database. |
| `tests/support/environment.ts` | Uses `withEnvironmentOverrides` to temporarily set `NODE_WITHDRAWAL_PERIOD_DAYS` and verify deadline math respects the shorter period. |
| `src/infrastructure/runtime/database.ts` | Uses `withTransaction` (via the local `inTransaction` helper) to run session-variant doors inside a real Mongo transaction and to test rollback semantics. |

## Notes

- **Real DB, not mocks.** The file intentionally avoids mocking the database or the conditional-update logic; the `$in` guard in `updateStatusIfIn` and the race-condition test both require a live engine.
- **`setupTestDb()` is at module top level**, not inside a `before`/`beforeAll` hook, so it runs once when the test file is imported.
- **Outbox relay is caller-driven for session variants.** After a session-variant door the test must call `nudgeOutbox()` itself, then `await settleOutboxNudges()`, before asserting on delivered events. Non-session doors handle this internally.
- **Deadline semantics are end-of-day.** `withdrawUntil` and `conformityUntil` are stamped at `23:59:59.999Z` of the last day of the period (e.g. 30 days after delivery date).
- **The file is truncated** in the provided excerpt (the race-condition `it` body and any further suites after it are cut off); treat the full file as authoritative for the complete list of test cases.
