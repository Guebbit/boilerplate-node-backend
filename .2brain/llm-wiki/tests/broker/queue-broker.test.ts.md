---
source: tests/broker/queue-broker.test.ts
sha256: 048606ab9b5cf93794b64a139d850a8c4ad1063d004f0630ca2041d7e3967de1
generated_at: 2026-10-29T06:37:34.936687+00:00
model: ollama:qwen3.8:27b
---

# tests/broker/queue-broker.test.ts

## Purpose

Integration test for the queue adapter (`src/infrastructure/adapters/queue.ts`) run against a **real** RabbitMQ broker. It covers behaviors only a live broker can confirm: topology declaration of quorum queues, retry republish carrying the `x-retry-attempt` header, dead-letter parking after delivery-limit exhaustion, and the idempotent-declare path. It is the complement to `tests/unit/infrastructure/adapters/queue.test.ts`, which mocks `amqplib` and only verifies the arguments handed to the broker.

## Key elements

- **`inBrokerEnvironment(body, extra?)`** – Wraps a test case with the broker URL and short retry knobs (`RETRY_DELAY_SECONDS = 1`, `MAX_ATTEMPTS = 2`) as environment overrides, then restores them.
- **`bootAdapter(environment?)`** – Calls `jest.resetModules()` then dynamically imports the adapter module, starts it, and waits until `queueState() === 'ready'`. Yields an isolated adapter instance (one connection each), which is required for the idempotent-declare and reconnect cases.
- **`rawChannel()`** – Opens a raw `amqplib` connection/channel on the test vhost for interactions that are *not* the adapter (inspector, crash simulation).
- **`depth(name)`** – Reads a queue's ready message count via a passive declare (`channel.checkQueue`), avoiding the management API whose stats lag by its sampling interval.
- **`recorder(decide?)`** – Returns a handler that logs every delivery (payload, raw message, timestamp) and delegates ack/nack/retry to a caller-supplied `decide(callIndex)` function.
- **`crashOnce(queue)` / `crashRepeatedly(queue, times)`** – Simulate a worker that consumes one message then closes its channel without acking, causing the broker to increment the delivery count and redeliver.
- **`uniqueQueue()`** – Generates a random queue name (`broker-test.<8 hex chars>`) so cases never collide.
- **`waitUntil(check, what, timeoutMs?)`** – Polls `check` at 100 ms intervals; rejects with a descriptive message on timeout. Built on `retryUntil` from `tests/support/eventually.ts`.
- **`quiet(ms)`** – Resolves after `ms` ms; used for negative assertions ("this did not happen within X").
- **`inspector`** – Lazily-created shared channel for `depth()` reads; cleaned up in `afterEach`.

## Relationships

- **`src/infrastructure/adapters/queue.ts`** – The module under test. Imported dynamically (never a top-level `import`) so each `bootAdapter` call gets a fresh module instance with its own connection.
- **`tests/broker/support/rabbitmq.ts`** – Provides `startRabbitMq()` (boots a RabbitMQ container in `beforeAll`) and the `TestRabbitMq` type (exposes `.url` and `.management.*` helpers used to assert queue type/arguments).
- **`tests/support/environment.ts`** – Supplies `withEnvironmentOverrides`, used by both `inBrokerEnvironment` and `bootAdapter` to set/restore env vars around each case.
- **`tests/support/eventually.ts`** – Supplies `retryUntil`, the polling primitive behind `waitUntil`.

## Notes

- **Module isolation is deliberate.** `jest.resetModules()` before each `import('@infrastructure/adapters/queue')` is required because the adapter stores its channel in module-level state. Two copies behave like two processes; skipping the reset would let one case's connection leak into another.
- **`anyPayload = z.unknown()`** is used for the schema parameter of `consumeFromQueue`. These tests assert delivery mechanics, not payload validation, so the schema is intentionally permissive.
- **Management API vs. passive declare:** `depth()` uses `channel.checkQueue` (passive declare) rather than `broker.management.queue()` because the management plugin's counters update on a fixed stats interval and can lag by several seconds—too unreliable for tight assertions.
- **Deliberate gaps:** The webhook delivery path through the broker and publish-confirm refusal/timeout are excluded (covered by `webhooks/tests/integration/delivery.test.ts` and the unit suite respectively). A broker cannot be forced to reject a confirm without testing RabbitMQ itself.
- **`jest.setTimeout(120_000)`** replaces the default 5 s timeout because real TTLs, container startup, and image pulls exceed it.
- **`DELIVERY_LIMIT = 3`** mirrors the `QUORUM_DELIVERY_LIMIT` constant in `queue.ts`; it is the broker-side limit, separate from the adapter's `MAX_ATTEMPTS` retry budget.
