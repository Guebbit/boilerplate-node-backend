---
source: tests/integration/kernel/outbox-bus-failure.test.ts
sha256: 8d0843c9b379671c3496532d7d88efe935db5060e651b45c4cf15044754490d2
generated_at: 2026-10-15T12:47:32.884067+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/kernel/outbox-bus-failure.test.ts

## Purpose

Integration test that verifies the outbox relay's failure path: when the event bus rejects an event during `relayOutbox`, the persisted row must retain the rejection reason in `lastError` and the event must remain `pending` (rescheduled) rather than being silently dropped. It exists because `emitDomainEvent` is the one layer where a runtime rejection is possible, and the relay must handle it gracefully.

## Key elements

- **`setupTestDb()`** — initialises an isolated in-memory (or throwaway) database for the test.
- **`jest.mock('@kernel/events', …)`** — partial mock that replaces only `emitDomainEvent` with a function that always rejects (`new Error('bus broke')`) and sets `domainEventsWired: () => true`; all other exports of the events module are loaded via `jest.requireActual`.
- **`describe('relayOutbox on a rejecting bus')`** — single test case:
  - Enqueues one event (`test.outbox`, payload `{ n: 1 }`, aggregate `agg-1`) inside a transaction via `withTransaction`.
  - Calls `relayOutbox()` and asserts the return is `{ retried: 1 }`.
  - Asserts the outbox row is still `status: 'pending'` with `lastError` containing the string `'bus broke'`.

## Relationships

- **`src/kernel/outbox.ts`** — system under test; supplies `enqueueOutboxEvent`, `outboxEventModel`, and `relayOutbox`.
- **`src/infrastructure/runtime/database.ts`** — provides `withTransaction`, used to wrap the enqueue call so it runs in a real (test) DB transaction.
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb`, which configures the database connection/model compilation before the test executes.

## Notes

- The mock is deliberately partial: only `emitDomainEvent` is stubbed so the rest of the kernel event wiring still loads and any guard checks (e.g. `domainEventsWired`) are satisfied with `() => true`.
- `as never` casts on the enqueue arguments suppress strict typing; the test intentionally uses minimal/irrelevant payload shapes.
- The test asserts on the *first* failure only (`retried: 1`). It does not cover repeated failures, exponential back-off, or the eventual-success path.
