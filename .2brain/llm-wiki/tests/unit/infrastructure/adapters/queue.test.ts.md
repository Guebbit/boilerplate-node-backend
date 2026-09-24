---
source: tests/unit/infrastructure/adapters/queue.test.ts
sha256: 3257fa952115638a1a6210a0493f214951ace5057112d22d7f67a5c950399aab
generated_at: 2026-09-23T20:20:02.011304+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/queue.test.ts

## Purpose

Unit tests for the RabbitMQ queue adapter (`@infrastructure/adapters/queue`). Verifies the enabled/disabled gate, publish confirm semantics, dead-letter topology wiring, consume/ack/nack flow, parked-counts reporting, and connection recovery—entirely against a hand-built `amqplib` mock with no real broker.

## Key elements

- **`mockSendToQueue`** – Core mock of a confirm-channel `sendToQueue`. Accepts a callback (broker confirm) and a boolean return (local write-buffer signal). Individual tests override its behavior to simulate backpressure, broker refusal, or a confirm that never arrives.
- **`channelMock()`** – Factory returning the shape of a `ConfirmChannel` (assertQueue, sendToQueue, consume, ack, nack, prefetch, etc.) used by the publish/consume path.
- **`mockPlainChannelClose` / `mockCreateChannel`** – A deliberately separate plain-channel mock for `parkedCounts()`, ensuring a broker error on one channel is not conflated with the shared publish channel in tests.
- **`mockConnect` / `capturedSetup` / `fakeConnectionModel`** – Replay amqplib's `connect(url, { recovery: { setup } })` contract: `setup` is awaited before `connect` resolves; reconnect is surfaced as `connect`/`disconnect` events on the resolved model.
- **`simulateReconnect()`** – Re-invokes the captured `setup` on a fresh model, then fires the `connect` event, matching amqplib's `recovery.js` `_connect()` order.
- **`ensureConnected()`** – Enables the queue via env vars, calls `startQueue()`, then awaits the promise returned by the latest `mockConnect` call. Most tests depend on this to guarantee a channel exists before exercising publish/consume.
- **`enableRabbitMQ()` / `disableRabbitMQ()`** – Set or clear the `NODE_RABBITMQ_*` env vars that `isQueueEnabled()` reads.
- **`describe('isQueueEnabled()')`** – Verifies the gate logic (URL, HOST+PORT, explicit `ENABLED=0`).
- **`describe('publishToQueue()')`** – Covers the no-op when disabled, successful publish (persistent, priority 0), backpressure (boolean `false` but confirm still arrives → `true`), broker refusal (confirm callback with error → `false`), confirm timeout (5 s, fake timers → `false`), and the full dead-letter topology assertion (work queue → retry queue with 30 s TTL → `.dead` queue, all durable, bound via `DEAD_LETTER_EXCHANGE`).
- **`queueJobsDeadLetteredTotal`** (from `metrics-queue.ts`) – Imported and presumably asserted in the dead-letter/park tests to confirm the metric increments.

## Relationships

- **`src/infrastructure/adapters/queue.ts`** – The module under test; all exports (`isQueueEnabled`, `publishToQueue`, `consumeFromQueue`, `startQueue`, `stopQueue`, `parkedCounts`, `DEAD_LETTER_EXCHANGE`, `deadLetterQueueOf`) are exercised here.
- **`src/infrastructure/observability/metrics-queue.ts`** – Provides `queueJobsDeadLetteredTotal`, imported so tests can assert the dead-letter counter fires when a message is parked.
- **`src/types/index.ts`** – Source of `EmailJobPayloadSchema` and `WORKER_CHANNELS` constants used in publish/consume test cases.
- **`src/modules/webhooks/services/{attempt,publish,sweep}.ts`** and **`src/modules/account/services/two-factor.ts`** – Downstream consumers of the queue adapter; not directly imported in this file but their call patterns (publish a typed payload, check enabled state) are what the adapter contract here guarantees.

## Notes

- **Confirm vs. boolean return:** The tests explicitly encode that `publishToQueue` must resolve `true`/`false` based on the broker confirm callback, _not_ the boolean that `sendToQueue` returns. Treating the boolean as success/failure would cause a double-execution bug (inline fallback runs alongside a publish that was actually accepted). Three distinct test cases pin this behavior.
- **Separate plain channel for `parkedCounts`:** `queue.ts` opens its own `model.createChannel()` for checking dead-letter depth. The mock keeps this isolated from the confirm channel so a failure on one cannot be mistaken for the other in assertions.
- **Reconnect is event-driven, not a second `connect()` call:** The mock resets `modelListeners` on each `mockConnect` invocation; `simulateReconnect` re-runs `setup` then emits `connect`. Tests that depend on the `on('connect')` handler re-creating a channel must use this helper rather than calling `mockConnect` again.
- **`ensureConnected` must be called before any publish/consume test:** `getChannel()` in `queue.ts` intentionally does not await a connection; this helper bridges that gap for tests.
