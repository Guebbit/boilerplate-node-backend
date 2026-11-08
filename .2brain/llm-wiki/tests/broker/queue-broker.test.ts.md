---
source: tests/broker/queue-broker.test.ts
sha256: 048606ab9b5cf93794b64a139d850a8c4ad1063d004f0630ca2041d7e3967de1
generated_at: 2026-11-08T09:17:19.515236+00:00
model: ollama:qwen3.8:27b
---

# tests/broker/queue-broker.test.ts

## Purpose

Integration test suite that exercises the queue adapter (`src/infrastructure/adapters/queue.ts`) against a **real** RabbitMQ broker. Where the unit suite mocks `amqplib` and only proves which arguments are handed over, these cases verify what the broker actually does: whether the quorum-queue topology declares cleanly, whether a retry republish stamps `x-retry-attempt` the way `attemptsOf` expects, and where a message lands once the delivery limit is exhausted. The webhook path and publish-confirm refusal are intentionally excluded (covered by e2e and unit suites respectively).

## Key elements

- **`bootAdapter(env?)`** — Resets Jest's module registry, dynamically imports a fresh copy of the adapter (each copy owns one connection, simulating separate processes), starts it, and resolves once `queueState() === 'ready'`.
- **`inBrokerEnvironment(body, extra?)`** — Wraps a test body with `withEnvironmentOverrides` setting `NODE_RABBITMQ_URL`, short retry delay (1 s), and max attempts (2).
- **`recorder(decide?)`** — Returns a handler that logs every delivery (payload, raw message, timestamp) and delegates ack/nack/retry to the `decide` callback.
- **`crashOnce` / `crashRepeatedly`** — Simulate a worker dying mid-delivery by consuming without ack and immediately closing the channel; the broker requeues the message with `x-delivery-count` incremented.
- **`depth(queueName)`** — Reads a queue's ready-message count via a passive declare (`checkQueue`), avoiding the management API's stats-interval lag.
- **`waitUntil(check, what, timeoutMs?)`** — Polls a predicate (via `retryUntil`) until truthy or rejects with a descriptive timeout message.
- **`uniqueQueue()`** — Returns a random `broker-test.*` name so cases never see each other's queues.
- **`rawChannel()`** — Opens a raw `amqplib` channel on the test vhost for inspector operations.
- **`afterEach` cleanup** — Stops every adapter copy and closes every raw connection the case opened; tolerates already-closed handles.
- **Test suites** — *"the topology on a real broker"* (quorum type, delivery-limit, dead-letter, overflow arguments on work/retry/dead queues; idempotent re-declare) and *"retry and parking"* (retry redelivery with `x-retry-attempt` header, dead-letter parking after max attempts, `parkedCounts` reporting).

## Relationships

- **`src/infrastructure/adapters/queue.ts`** — The module under test. Imported dynamically inside `bootAdapter` after `jest.resetModules()` so each test gets an isolated adapter instance.
- **`tests/broker/support/rabbitmq.ts`** — Provides `startRabbitMq` (spins up the container with management plugin) and the `TestRabbitMq` type; called in `beforeAll`, stopped in `afterAll`.
- **`tests/support/environment.ts`** — `withEnvironmentOverrides` is the mechanism both `inBrokerEnvironment` and `bootAdapter` use to point the adapter at the test broker and tune retry knobs.
- **`tests/support/eventually.ts`** — `retryUntil` powers the `waitUntil` polling helper.

## Notes

- `jest.setTimeout(120_000)` is set globally because real TTLs plus a container image pull exceed Jest's default 5 s timeout.
- `jest.resetModules()` is essential: the adapter caches its `amqplib` channel in module-level state, so a plain `require` would share the connection across "processes."
- `DELIVERY_LIMIT` (3) mirrors `QUORUM_DELIVERY_LIMIT` in `queue.ts`; tests assert the broker enforces this count, not just that the argument was passed.
- `depth` deliberately uses a passive declare instead of the management API because RabbitMQ's management counters update on a stats interval and can lag.
- The `inspector` channel is lazily created and shared within a single test case to avoid opening a new connection per `depth` call.
- `afterEach` swallows close errors on connections a case already dropped, so a failed assertion doesn't cascade into a teardown failure.
