---
source: tests/unit/infrastructure/adapters/queue.test.ts
sha256: 62428cf73fd9299858c433e8627292f3c14a315e05574a63d2dfa6b1a0f1f244
generated_at: 2026-09-27T16:05:44.998996+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/queue.test.ts

## Purpose

Unit tests for the RabbitMQ queue adapter (`src/infrastructure/adapters/queue.ts`). Validates queue enablement logic, publish confirmation semantics, dead-letter/retry topology, connection lifecycle (start/stop/reconnect), and `parkedCounts()`. Fully mocks `amqplib` so no live broker is needed.

## Key elements

- **`QUORUM_QUEUE_TYPE` / `AT_LEAST_ONCE_DEAD_LETTERING`** — local copies of queue.ts's non-exported argument objects; used in `assertQueue` call assertions.
- **`mockSendToQueue`** — simulates a confirm channel's `sendToQueue`; its *callback* (not return value) is treated as the broker's accept/reject signal. Individual tests override it to exercise backpressure, refusal, and timeout.
- **`channelMock()`** — returns the shared confirm-channel mock surface (assertQueue, sendToQueue, consume, ack/nack, etc.).
- **`mockCreateConfirmChannel` / `mockCreateChannel`** — separate mocks: the confirm channel (publish/consume) vs. the plain channel `parkedCounts()` uses exclusively.
- **`mockConnect`** — replays amqplib's real contract: awaits `recovery.setup` before resolving, resolves exactly once, captures the `setup` callback for reconnect simulation.
- **`simulateReconnect()`** — re-runs `setup` on a fresh model, then emits `connect`, matching amqplib's `recovery.js` ordering.
- **`enableRabbitMQ` / `disableRabbitMQ`** — set/clear the `NODE_RABBITMQ_*` env vars that gate `isQueueEnabled()`.
- **`ensureConnected()`** — enables the queue, stops then starts it, and awaits the connect promise so tests can assume a live channel.
- **Test suites** (visible before truncation): `isQueueEnabled()`, `publishToQueue()` — covering disabled state, successful publish, backpressure, broker refusal, confirm timeout, and dead-letter retry topology.

## Relationships

- **`src/infrastructure/adapters/queue.ts`** — the module under test; every public export (`isQueueEnabled`, `publishToQueue`, `consumeFromQueue`, `startQueue`, `stopQueue`, `parkedCounts`, `DEAD_LETTER_EXCHANGE`, `deadLetterQueueOf`) is imported and exercised here.
- **`src/infrastructure/observability/metrics-queue.ts`** — imports `queueJobsDeadLetteredTotal`; the test asserts it increments when `handleDelivery` parks a message to the dead-letter queue.
- **`src/types/index.ts`** — imports `EmailJobPayloadSchema` and `WORKER_CHANNELS` for payload-validation assertions in publish tests.

## Notes

- **Mirrored constants:** `QUORUM_QUEUE_TYPE` and `AT_LEAST_ONCE_DEAD_LETTERING` are *not* imported from `queue.ts` because they are internal to its `assertJobQueue` helper. If the production file changes either, these assertions will catch the drift.
- **Confirm-channel semantics:** The test encodes the invariant that `sendToQueue`'s boolean return is a local write-buffer signal (backpressure), *not* a success/failure indicator. The callback is the only source of truth for broker acceptance. A test that conflates the two would mask the double-run fallback bug the confirm design exists to prevent.
- **Priority 4, not 0:** Quorum queues treat unmarked messages as priority 4. The test asserts `priority: 4` in the publish options to guard against a regression that would silently demote normal messages.
- **Two distinct channel mocks:** The confirm channel (shared by publish/consume) and the plain channel (used only by `parkedCounts()`) are kept as separate mock objects so a broker error on one is never misattributed to the other.
- **Reconnect simulation ordering:** `simulateReconnect` awaits `setup` *before* emitting `connect`, mirroring `node_modules/amqplib/lib/recovery.js` exactly. Swapping the order would test an impossible amqplib state.
