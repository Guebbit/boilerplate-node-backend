---
source: tests/unit/infrastructure/adapters/queue.test.ts
sha256: f2da958be0b7f6ba3286774f289f8d25944d469eb2eca6c4969962a5382435ac
generated_at: 2026-11-08T10:10:07.528753+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/queue.test.ts

## Purpose
Unit tests for the RabbitMQ adapter (`src/infrastructure/adapters/queue.ts`). Verifies the queue's public surface — enabling detection, publish semantics (confirm-channel callback vs. return-value), consume/ack/nack, lifecycle (`startQueue`/`stopQueue`), dead-letter wiring, parking-queue depth reporting, and reconnection recovery — by mocking `amqplib` at the connection-model level rather than spinning up a broker.

## Key elements
- **amqplib mock block** — Replaces `amqplib.connect` with a hand-rolled `mockConnect` that replays the library's real recovery contract: it awaits the `setup` callback *before* resolving, and surfaces reconnects as `connect`/`disconnect` events on the returned model. Exposes `mockCreateConfirmChannel`, `mockCreateChannel` (plain, for `parkedCounts`), and `simulateReconnect` for test-driven reconnection.
- **`channelMock()`** — Shared confirm-channel shape (`sendToQueue` with callback, `ack`, `nack`, `consume`, `prefetch`, `assertQueue`, `assertExchange`, `bindQueue`, `cancel`, `on`).
- **`mockSendToQueue`** — Default implementation invokes the confirm callback with `null` (success) and returns `true`. Individual tests override to simulate backpressure (`return false` + success callback), broker refusal (callback fires error), or a never-arriving confirm (callback never called).
- **`QUORUM_QUEUE_TYPE` / `DEAD_LETTER_ARGUMENTS` / `AT_LEAST_ONCE_DEAD_LETTERING`** — Local mirrors of the argument groups `queue.ts` passes to `assertQueue`; kept here (not imported) so drift in the source is caught as a test failure.
- **`enableRabbitMQ` / `disableRabbitMQ`** — Set/clear the `NODE_RABBITMQ_*` env vars via `tests/support/environment.ts`.
- **`ensureConnected`** — Enables the queue, calls `stopQueue()` → `startQueue()`, and awaits the `connect` promise so subsequent tests run against a live channel.
- **`describe` blocks** — `isQueueEnabled()` (env-var matrix, credential URL-encoding), `publishToQueue()` (disabled short-circuit, happy path with quorum-queue args, backpressure, broker refusal, confirm timeout), and (truncated) further groups covering consume, dead-letter, parking counts, and lifecycle.

## Relationships
- **`src/infrastructure/adapters/queue.ts`** — Module under test; every import from `@infrastructure/adapters/queue` is an SUT symbol.
- **`src/infrastructure/adapters/logger.ts`** — Imported (`logger`); tests assert log calls or ensure no spurious logging on the disabled path.
- **`src/infrastructure/observability/metrics-queue.ts`** — Imported (`queueJobsDeadLetteredTotal`); tests verify the counter increments on dead-letter events.
- **`src/types/index.ts`** — Imported (`EmailJobPayloadSchema`, `WORKER_CHANNELS`); used to construct valid payloads and iterate known queues.
- **`tests/support/environment.ts`** — Imported (`setEnvironment`); the sole mechanism for mutating `NODE_RABBITMQ_*` vars per test.

## Notes
- **Confirm-channel semantics are the central contract.** `publishToQueue` resolves on the *callback*, not on `sendToQueue`'s boolean return. The mock's default fires the callback synchronously with `null`; tests must override both the callback and the return value independently to exercise backpressure vs. refusal vs. timeout.
- **Two separate channels are mocked.** The confirm channel (`mockCreateConfirmChannel`) carries publish/consume traffic; a *plain* channel (`mockCreateChannel`) is dedicated to `parkedCounts()` so a broker error on one is not conflated with the other in assertions.
- **Reconnection is event-driven, not a second `connect()` call.** `amqplib`'s recovery module re-runs the `setup` callback and then emits `connect` on the *original* model. `simulateReconnect` replays that exact order; do not model a reconnect as a second `mockConnect` invocation.
- **Priority `4`, not `0`.** Quorum queues treat an unmarked message as priority 4; the test asserts `sendToQueue` is called with `priority: 4` so that a future default-priority mismatch is caught.
- **Quorum/dead-letter argument constants are intentionally duplicated**, not imported, so a change in `queue.ts`'s `assertJobQueue` internals causes a test failure rather than a silent pass.
