# src/infrastructure/adapters/queue.ts

## Purpose

RabbitMQ (AMQP 0-9-1) adapter that provides publish/consume primitives over a single shared channel. Every public function degrades to a safe no-op when the broker is unconfigured, so callers (e.g. `mailer.ts → enqueueEmail`) fall back to inline work without special-casing the absent-broker case.

## Key elements

- **`getAmqpUrl`** (internal) — Builds the AMQP URL from `NODE_RABBITMQ_*` env vars; returns `undefined` when the queue is off.
- **`isQueueEnabled`** — Exported boolean: URL is buildable *and* `NODE_RABBITMQ_ENABLED` flag is true. Callers check this *before* building a payload.
- **`queueConnection`** (internal) — A `manageConnection<Channel>` instance. Handles memoised connect, shared in-flight promise, and one-shot unavailability warning. `connect` opens the TCP connection then creates a channel; both are supervised via `superviseHandle`. `close` flushes and closes the connection (channels close implicitly).
- **`queueState`** — Returns a `DependencyStatus` for the `/observability/health` endpoint. No I/O; reads cached connection state.
- **`getChannel`** (internal) — Resolves the shared `Channel` or `undefined` (the no-op signal).
- **`startQueue`** / **`stopQueue`** — Startup warm-up and graceful shutdown entry points.
- **`EMAIL_QUEUE`, `PDF_QUEUE`, `IMAGE_QUEUE`** — Queue name constants sourced from `WORKER_CHANNELS` (generated from `asyncapi.yaml`), eliminating producer/consumer string-mismatch risk.
- **`DEAD_LETTER_EXCHANGE`** / **`deadLetterQueueOf`** — `nack(msg, false, false)` routes to `<queue>.dead` under the `dead-letter` direct exchange rather than destroying the message.
- **`JobPriority`** (`'normal' | 'high'`) — Two-level priority mapped to AMQP `priority` 0/1 via `JOB_PRIORITY_VALUES`.
- **`assertJobQueue`** (internal) — Idempotently declares the dead-letter exchange, dead-letter queue, binding, and work queue (with `x-max-priority`). Called on both publish and consume paths.
- **`PublishOptions<TPayload>`** — Interface for the (truncated) publish API.

## Relationships

- **`@infrastructure/adapters/managed-connection.ts`** — Supplies the `manageConnection` factory that governs connect/close/warning lifecycle for this adapter (same pattern as the cache adapter).
- **`@infrastructure/adapters/logger.ts`** — Provides the `logger` used in `superviseHandle` error reporting.
- **`@infrastructure/runtime/environment.ts`** — `environmentFlag` gates queue enablement behind `NODE_RABBITMQ_ENABLED`.
- **`@infrastructure/observability/dependency-health.ts`** — Provides the `DependencyStatus` type that `queueState` returns; this adapter contributes one entry to the aggregate health payload.
- **`@types/index.ts`** — Exports `WORKER_CHANNELS`, the single source of queue-name spelling shared by producers and consumers.
- **`src/infrastructure/adapters/mailer.ts`** — Primary producer; `enqueueEmail` checks `isQueueEnabled` and publishes to `EMAIL_QUEUE` or sends inline.
- **`src/infrastructure/adapters/email.worker.ts`**, **`pdf.worker.ts`**, **`image.worker.ts`** — Consumers that call `consumeFromQueue` on their respective queues.
- **`src/infrastructure/runtime/server-lifecycle.ts`** / **`src/app.ts`** — Invoke `startQueue` at boot and `stopQueue` at shutdown.
- **`tests/unit/infrastructure/adapters/image.worker.test.ts`** — Exercises the consume path end-to-end against this adapter.

## Notes

- **Reconnect strategy is "forget and retry."** `superviseHandle` nulls the cached channel on either the channel's *or* the connection's `close` event. There is no automatic re-open; the next `getChannel()` call re-triggers `connect`. This means a burst of messages arriving between the close and the next call will simply no-op.
- **`isReady: () => true`** in `manageConnection` is intentional: the channel handle itself *is* the liveness signal. If `superviseHandle` has fired, the handle is already gone, so a non-null handle guarantees the broker is reachable.
- **Channel death ≠ connection death.** A channel can die (e.g. `PRECONDITION_FAILED` from `assertQueue` with mismatched args) while the TCP connection stays open. Without the channel-level `close` listener, the cached handle would survive as a corpse and `queueState` would incorrectly report `ready`.
- **Priority is approximate.** RabbitMQ reorders only within the current buffer; it is not a global priority heap. The two-level design is deliberate—more levels would create a false impression of strict scheduling.
- **`durable` flag on queues** controls whether definitions survive a broker restart. The dead-letter exchange and queue are always durable; the work queue's durability is a parameter.
- **`assertQueue` throws `PRECONDITION_FAILED`** (killing the channel) if the queue already exists with different arguments. Upgrading a broker with pre-existing queues requires care—see `docs/tools/rabbitmq.md`.
