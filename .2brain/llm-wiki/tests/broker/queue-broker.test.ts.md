---
source: tests/broker/queue-broker.test.ts
sha256: 22d0f2a5c70400fe66db961a06084235f73a9a4f2b558abcd4b6e491108d62c9
generated_at: 2026-10-15T12:30:33.511409+00:00
model: ollama:qwen3.8:27b
---

# tests/broker/queue-broker.test.ts

## Purpose

Integration test suite for the queue adapter that runs against a **real RabbitMQ** instance (started in a container). The unit suite mocks `amqplib` and only verifies the arguments passed to the broker; this file answers questions only a live broker can: whether topology actually declares on the running version, whether a retry republish carries the `x-retry-attempt` header, and where a message lands once its delivery limit is exhausted.

## Key elements

- **`bootAdapter(environment?)`** – Re-imports `@infrastructure/adapters/queue` with `jest.resetModules()` so each copy owns its own connection and module-level channel state. Waits until `queueState() === 'ready'`.
- **`inBrokerEnvironment(body, extra?)`** – Wraps a test case in `withEnvironmentOverrides` setting `NODE_RABBITMQ_URL`, retry delay (1 s), and max attempts (2).
- **`uniqueQueue()`** – Returns a random queue name (`broker-test.<rand>`) so cases never collide with leftovers from prior cases.
- **`recorder(decide?)`** – Returns a handler that logs each delivery (payload, raw message, timestamp) into a `Seen[]` array and delegates ack/nack/reject to `decide(callIndex)`.
- **`crashOnce(queue)` / `crashRepeatedly(queue, times)`** – Simulate a worker dying without acking; resolve with the `ConsumeMessage` (or an array of `x-delivery-count` values) the broker redelivers.
- **`depth(name)`** – Reads a queue's ready message count via a passive declare (`channel.checkQueue`), avoiding the laggy management-API counters.
- **`waitUntil(check, what, timeoutMs?)`** – Polls `check()` every 100 ms until truthy; rejects with a descriptive error on timeout.
- **`quiet(ms)`** – Simple sleep used to assert that something does *not* happen within a window.
- **`anyPayload`** – `z.unknown()`, a permissive schema so cases focus on delivery mechanics rather than payload contracts.
- **Three `describe` blocks** – topology declaration (quorum queues, retry/dead arguments, idempotent re-declare), retry & parking (attempt header, dead-letter after max attempts), and delivery-limit crash behavior (truncated in source).

## Relationships

- **`src/infrastructure/adapters/queue.ts`** – The module under test. Imported dynamically (after `jest.resetModules()`) to obtain fresh, independent adapter instances; its exports (`startQueue`, `stopQueue`, `publishToQueue`, `consumeFromQueue`, `queueState`, `deadLetterQueueOf`, `EMAIL_QUEUE`, etc.) are the API exercised by every case.
- **`tests/broker/support/rabbitmq.ts`** – Provides `startRabbitMq()` (spins up a RabbitMQ container with the management plugin) and the `TestRabbitMq` type. Called in `beforeAll`; `broker.stop()` in `afterAll`.
- **`tests/support/environment.ts`** – Provides `withEnvironmentOverrides`, used both by `inBrokerEnvironment` (per-case env) and `bootAdapter` (env visible at module-import time).

## Notes

- **Module state isolation:** The adapter caches its channel in module scope. `bootAdapter` relies on `jest.resetModules()` to get an independent copy; without this, two adapters would share one channel and the idempotent-declare case would be meaningless.
- **Long timeout:** `jest.setTimeout(120_000)` because real TTLs (1 s × retries) plus container image pulls exceed Jest's default.
- **`depth` vs. management API:** The test deliberately uses `channel.checkQueue` (passive declare) for message counts rather than the management REST API, whose stats lag by its reporting interval.
- **Cleanup is best-effort:** `afterEach` stops all tracked adapters and closes all tracked connections; a `.catch(() => undefined)` swallows errors from connections a case already dropped.
- **Explicitly excluded:** Webhook delivery through the broker (covered by the live e2e and `webhooks/tests/integration/delivery.test.ts`) and publish-confirm refusal/timeout (untestable without sabotaging RabbitMQ itself).
