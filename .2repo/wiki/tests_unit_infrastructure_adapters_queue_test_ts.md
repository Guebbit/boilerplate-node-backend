# tests/unit/infrastructure/adapters/queue.test.ts

## Purpose

Unit tests for the RabbitMQ queue adapter (`src/infrastructure/adapters/queue.ts`). Validates the enable/disable gate, publish/consume lifecycle, dead-letter queue wiring, channel supervision, and the four-arm acknowledgement policy (ack / discard / requeue / discard-malformed) — all against a fully mocked `amqplib` channel, with no broker required.

## Key elements

- **`amqplib` mock** — A single `jest.mock('amqplib')` that returns a connection object with a factory `createChannel` → `channelMock()`, exposing `assertQueue`, `assertExchange`, `bindQueue`, `sendToQueue`, `prefetch`, `consume`, `ack`, `nack`, and `on`. All are shared `jest.fn()` instances so assertions can inspect calls after any adapter function runs.
- **`enableRabbitMQ` / `disableRabbitMQ` helpers** — Set or delete the `NODE_RABBITMQ_*` env vars that gate `isQueueEnabled()`. Used in `afterEach` to isolate cases.
- **`isQueueEnabled()` block** — Verifies the truth-table: no vars → false; URL set → true; HOST+PORT → true; `NODE_RABBITMQ_ENABLED='0'` → false.
- **`publishToQueue()` block** — Checks the no-op path, successful `sendToQueue` call shape (persistent, priority 0), dead-letter exchange/queue/binding declarations, and that a mid-publish channel failure **resolves to `false`** rather than rejecting (preserving the inline-fallback contract for callers like `enqueueEmail`).
- **Channel supervision block** — Asserts `channel.on('error')` and `channel.on('close')` are registered, guarding against uncaught-exception and stale-handle failure modes.
- **`consumeFromQueue()` block** — Verifies consumer registration: queue declaration with dead-letter args and `x-max-priority`, `prefetch(1)`, and `consume` call.
- **`startQueue()` / `stopQueue()` block** — Confirm both resolve gracefully (undefined) when the queue is disabled or no connection exists.
- **Acknowledgement policy block** — Uses a `captureConsumerCallback` helper to extract the per-delivery callback from `mockConsume`'s arguments, then feeds it synthetic deliveries to assert:
  - `ack` when handler resolves `true`
  - handler receives the **parsed JSON body**, not the raw `Buffer`
  - `nack(msg, false, false)` when handler resolves `false` (deliberate refusal → discard)
  - `nack(msg, false, true)` when handler throws (presumed transient → requeue)
  - (truncated) discard path for unparseable payloads

## Relationships

- **`src/infrastructure/adapters/queue.ts`** — The sole import target. Every `describe` block exercises one or more of its exports (`isQueueEnabled`, `publishToQueue`, `consumeFromQueue`, `startQueue`, `stopQueue`, `DEAD_LETTER_EXCHANGE`, `deadLetterQueueOf`). The tests also implicitly constrain the adapter's `amqplib` usage (call order, argument shapes, error-handling semantics) even though `amqplib` is mocked.

## Notes

- The file relies on **shared mutable mock state** (`mockAssertQueue`, `mockSendToQueue`, etc.) across cases within a `describe` block. Tests that need a fresh channel call `stopQueue()` + `mockClear()` first (see the channel-supervision case).
- `publishToQueue` returning `false` on failure (vs. throwing) is a **load-bearing contract**: callers use the boolean to decide whether to fall back to inline work. A regression to a rejection would surface only as an `unhandledRejection` with no request context.
- The acknowledgement-policy tests are the only ones that actually **invoke the consumer callback**; earlier `consumeFromQueue` tests stop at "a consumer was registered" and never touch the ack/nack logic.
- `afterEach(disableRabbitMQ)` is the primary isolation mechanism — any test that forgets to call `enableRabbitMQ` will silently hit the disabled path rather than fail.
