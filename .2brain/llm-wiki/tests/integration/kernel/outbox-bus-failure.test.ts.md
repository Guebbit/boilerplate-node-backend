---
source: tests/integration/kernel/outbox-bus-failure.test.ts
sha256: 8d0843c9b379671c3496532d7d88efe935db5060e651b45c4cf15044754490d2
generated_at: 2026-11-08T09:41:29.773941+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/kernel/outbox-bus-failure.test.ts

## Purpose

Verifies that `relayOutbox` correctly records a bus-level rejection in the outbox row's `lastError` field and leaves the event in `pending` state for retry, rather than marking it as a permanent failure. This scenario (the event bus itself rejecting) is outside the normal `emitDomainEvent` contract, so it must be simulated.

## Key elements

- **`jest.mock('@kernel/events', …)`** — Partial mock that spreads `requireActual` and replaces only `emitDomainEvent` with a function that rejects with `"bus broke"`. All other exports from the events module remain real, so the rest of the kernel loads normally.
- **`setupTestDb()`** — Top-level call that initialises the in-memory (or transaction-wrapped) test database before any test runs.
- **`describe('relayOutbox on a rejecting bus')`** — Single test that:
  1. Enqueues one outbox event via `enqueueOutboxEvent` inside a `withTransaction` session.
  2. Calls `relayOutbox()` and asserts the return value contains `{ retried: 1 }`.
  3. Reads the row back with `outboxEventModel.findOne().lean()` and asserts `status` is still `'pending'` and `lastError` contains `"bus broke"`.

## Relationships

- **`src/kernel/outbox.ts`** — The module under test. Provides `enqueueOutboxEvent` (seeds a row), `relayOutbox` (drives delivery), and `outboxEventModel` (reads the row back).
- **`src/infrastructure/runtime/database.ts`** — Supplies `withTransaction`, used to obtain a DB session for the setup `enqueueOutboxEvent` call.
- **`tests/support/setup-test-db.ts`** — Provides `setupTestDb`, which configures the test database connection/model registrations that the test depends on.

## Notes

- The mock is intentionally **partial** (`...jest.requireActual`). Replacing the whole module would break internal kernel wiring; the comment in the file flags this.
- The test data uses `as never` casts on the `enqueueOutboxEvent` arguments — a type-level workaround, not a semantic concern.
- The assertion checks that `status` remains `'pending'` (i.e. the event is **rescheduled**, not dropped). This is the key behavioural contract: a transient bus failure must not poison the outbox.
