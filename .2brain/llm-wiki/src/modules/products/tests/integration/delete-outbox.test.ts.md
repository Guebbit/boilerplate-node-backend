---
source: src/modules/products/tests/integration/delete-outbox.test.ts
sha256: 221a81e7431de247c896c150f599f5fb98f136c63a767981aabc184558c0ab9d
generated_at: 2026-11-08T07:50:47.605233+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/integration/delete-outbox.test.ts

## Purpose

Integration test that verifies the `product.deleted` domain event is written to the transactional outbox atomically with the product delete (both hard and soft paths), that a failing consumer is retried by the relay rather than silently dropped, and that the operation is idempotent on an already-deleted product.

## Key elements

- **`rows()`** – helper that queries `outboxEventModel` for all `PRODUCT_DELETED` events regardless of status.
- **`describe('product.deleted through the outbox')`** – top-level suite; sets up a `deleted` mock consumer subscribed via `onDomainEvent` and marks the kernel as wired.
- **`it.each([false, true])` – "writes one row… and delivers it"** – asserts exactly one outbox row keyed on the product `aggregateId`, status `published`, and that the consumer receives the expected payload plus `eventId`.
- **`it.each([false, true])` – "leaves no row… when the write fails"** – spies on `productRepository.deleteOne`/`save` to reject, then asserts zero outbox rows and the product still present (transactional consistency).
- **`it` – "a throwing consumer… relay retry"** – makes the consumer reject once, confirms the row stays `pending` with `attempts: 1`, then forces `nextAttemptAt` to epoch and calls `relayOutbox()` to verify a second delivery.
- **`it` – "announces nothing for a soft delete repeated…"** – calls `removeById` twice on an already-soft-deleted product and asserts only one outbox row exists (idempotency).

## Relationships

- **`src/kernel/events.ts`** – provides `resetDomainEvents`, `markDomainEventsWired`, and `onDomainEvent` used to wire/unwire the mock consumer per test.
- **`src/kernel/outbox.ts`** – provides `outboxEventModel` (Mongoose model queried by `rows()`), `settleOutboxNudges` (flushes async outbox nudges), and `relayOutbox` (triggers the retry relay in the retry test).
- **`src/modules/products/events.ts`** – exports the `PRODUCT_DELETED` event-name constant used in both the subscription and the outbox query.
- **`src/modules/products/services/index.ts`** – exports `productService`; its `removeById` method is the SUT under test.
- **`src/modules/products/repository.ts`** – exports `productRepository`; spied on in the failure test to simulate a DB rejection, and used to confirm the product still exists.
- **`src/modules/products/tests/factories.ts`** – exports `createProduct` to seed a product row before each scenario.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` initialises an in-memory/ephemeral Mongo instance for the suite.

## Notes

- `markDomainEventsWired()` must be called in `beforeEach` because the relay only dispatches in a process that has registered at least one subscriber; without it the outbox row would remain `pending` and the consumer would never fire.
- The retry test bypasses the normal backoff by setting `nextAttemptAt` to `new Date(0)` and then calling `relayOutbox()` directly — it does not rely on a real timer.
- The failure test spies on different repository methods depending on `hardDelete` (`deleteOne` vs `save`), reflecting that the two delete paths use distinct write operations.
