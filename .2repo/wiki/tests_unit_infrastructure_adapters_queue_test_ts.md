# tests/unit/infrastructure/adapters/queue.test.ts

## Purpose

Unit tests for the RabbitMQ queue adapter (`src/infrastructure/adapters/queue.ts`). Validates the adapter's public API — enablement detection, publish, consume, lifecycle management, dead-letter wiring, and the ack/nack acknowledgement policy — using a fully mocked `amqplib` layer so no real broker is needed.

## Key elements

- **`amqplib` mock** — Replaces `amqplib.connect` with a hand-built object graph (`mockConnect` → `mockCreateChannel` → `channelMock()` exposing `assertQueue`, `assertExchange`, `bindQueue`, `sendToQueue`, `prefetch`, `consume`, `ack`, `nack`, `on`). Every assertion targets one of these spies.
- **`enableRabbitMQ` / `disableRabbitMQ` helpers** — Set or clear the `NODE_RABBITMQ_*` environment variables that gate adapter behavior. `disableRabbitMQ` runs in every `afterEach`.
- **`isQueueEnabled()` block** — Confirms the four-way env-var truth table (URL, HOST+PORT, explicit `ENABLED=0`, nothing set).
- **`publishToQueue()` block** — Verifies the return-value contract (boolean, never a throw), the `sendToQueue` call shape (`persistent: true`), and the dead-letter wiring: `assertExchange(DEAD_LETTER_EXCHANGE)` → `assertQueue(deadLetterQueueOf(q))` → `bindQueue(...)` → `assertQueue(q, { deadLetterExchange, deadLetterRoutingKey })`.
- **Channel supervision test** — Asserts that `channel.on` is called for both `'error'` and `'close'`, guarding against the case where the broker kills a channel while the connection stays open.
- **`consumeFromQueue()` block** — Confirms no-op when disabled; when enabled, checks durable + dead-letter queue options, `prefetch(1)`, and `consume` registration.
- **`startQueue()` / `stopQueue()` block** — Verifies both resolve cleanly (no throw) when the adapter is disabled / not connected.
- **Ack-acknowledgement policy block** — Uses the `captureConsumerCallback` helper to extract the per-delivery callback that `consumeFromQueue` hands to `mockConsume`, then invokes it with synthetic `delivery()` buffers to assert the four ack/nack arms:
  - handler → `true` ⇒ `ack`
  - handler → `false` ⇒ `nack(msg, false, false)` (discard, no requeue)
  - handler throws ⇒ `nack(msg, false, true)` (requeue)
  - unparseable body ⇒ `nack(msg, false, false)` (discard, no requeue)
  - handler receives the **parsed** body, not the raw `Buffer`.

## Relationships

- **`src/infrastructure/adapters/queue.ts`** — SUT. This test imports `isQueueEnabled`, `publishToQueue`, `consumeFromQueue`, `startQueue`, `stopQueue`, `DEAD_LETTER_EXCHANGE`, and `deadLetterQueueOf` from that module. All assertions verify the observable behavior of those exports.

## Notes

- The `amqplib` mock is module-level (not per-test), so spies persist across tests. Tests that need a "fresh channel" must explicitly call `await stopQueue()` first (see the channel-supervision test) or reset individual mocks.
- `mockConsume.mock.calls[0][1]` is the callback the adapter registers. The ack-policy tests depend on this positional index; if the adapter's `consume` call signature changes, `captureConsumerCallback` breaks silently.
- The file contains several block comments explaining *why* a behavior exists (dead-letter as a safety net for `nack(false,false)`, requeue-vs-discard distinction, channel vs. connection supervision). These are intentional documentation, not dead comments.
- The truncated final test (requeue-on-throw) confirms `nack` is called with `requeue = true`, the only arm that re-delivers the message to the broker.
