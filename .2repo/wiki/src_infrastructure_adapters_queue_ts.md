# src/infrastructure/adapters/queue.ts

## Purpose

RabbitMQ (AMQP 0-9-1) adapter that exposes publish and consume primitives over a single shared channel. Every public function degrades to a safe no-op when the broker is unconfigured or unreachable — `publishToQueue` resolves `false` so callers (e.g. `mailer.ts → enqueueEmail`) can fall back to doing the work inline. Queue names are sourced from the generated `WORKER_CHANNELS` constant to keep producers and consumers in lock-step.

## Key elements

- **`isQueueEnabled()`** – exported guard; checks that an AMQP URL can be built *and* the `NODE_RABBITMQ_ENABLED` flag isn't `false`. Callers branch on it before building a payload.
- **`queueConnection`** – the `manageConnection<Channel>` instance. Encapsulates memoised connect, shared in-flight promise, and one-time unavailable warning. The `connect` step is two-phase (TCP connection → channel); both are supervised via `superviseHandle`.
- **`superviseHandle(handle, onClose)`** – attaches mandatory `error` and `close` listeners to any amqplib `EventEmitter`. Without this, an unhandled `error` event crashes the process.
- **`queueState()`** – returns a `DependencyStatus` for the health endpoint. Reads cached state only; performs no I/O.
- **`startQueue()` / `stopQueue()`** – boot-time warm-up and graceful shutdown (flush + close connection, which implicitly closes channels).
- **`EMAIL_QUEUE`, `PDF_QUEUE`, `IMAGE_QUEUE`** – re-exported from `WORKER_CHANNELS`; the single source of truth for queue spelling.
- **`DEAD_LETTER_EXCHANGE` / `deadLetterQueueOf(queue)`** – naming convention: `direct` exchange `dead-letter`, per-queue DLQ named `<queue>.dead`.
- **`assertJobQueue(ch, queue, durable)`** – idempotent declaration of the DLX → DLQ → work-queue binding. Called on both publish and consume paths so either side may start first.
- **`PublishOptions<TPayload>` / `publishToQueue<TPayload>()`** – publishes to the default exchange with the queue name as routing key. `durable` and `persistent` default to `true`. Returns `boolean` (accepted vs. unavailable) so callers can choose inline fallback.
- **`getAmqpUrl()`** – internal; assembles `amqp://…` from `NODE_RABBITMQ_*` env vars. Returns `undefined` when the required port is absent.

## Relationships

- **`@infrastructure/adapters/managed-connection`** – provides `manageConnection`, the shared memoise-and-warn wrapper around the two-step AMQP connect.
- **`@infrastructure/adapters/logger`** – imported for structured log output (used in the truncated portion for warnings/errors).
- **`@infrastructure/observability/dependency-health`** – supplies the `DependencyStatus` type that `queueState()` returns; consumed by the `/observability/health` endpoint.
- **`@types` (`WORKER_CHANNELS`)** – generated from `asyncapi.yaml`; the sole source for queue-name constants.
- **`@infrastructure/runtime/environment`** – `environmentFlag` gates the `isQueueEnabled` check.
- **`@infrastructure/adapters/mailer`** – primary caller; branches on `isQueueEnabled` / `publishToQueue` result to decide inline vs. queued send.
- **`@infrastructure/adapters/{email,image,pdf}.worker`** – consumers that `assertJobQueue` and `consumeFromQueue` on the queues this module publishes to.
- **`@app.ts` / `@app/workers.ts` / `@infrastructure/runtime/server-lifecycle`** – orchestrate `startQueue` / `stopQueue` during process boot and shutdown.
- **`tests/unit/infrastructure/adapters/queue.test.ts`** – unit tests for this module.
- **`tests/unit/infrastructure/adapters/image.worker.test.ts`** – exercises queue interactions indirectly via the image worker.

## Notes

- **Two handles, one socket.** The `ChannelModel` (connection) is stored separately because a `Channel` has no back-reference to its connection, and only closing the connection releases the TCP socket. `close()` must close the connection, not the channel.
- **Unsupervised EventEmitters are fatal.** Both connection and channel emit `error`; an unhandled one terminates the process. `superviseHandle` exists so the pair can't be attached on one and forgotten on the other.
- **Channel death ≠ connection death.** A channel can die (e.g. `PRECONDITION_FAILED` from a mismatched `assertQueue`) while the connection stays open. Without per-channel `close` supervision, the cached handle becomes a corpse and `queueState()` keeps reporting `ready`.
- **Dead-letter ordering matters.** The DLQ must be bound to the DLX *before* the work queue names that exchange; otherwise `x-dead-letter-exchange` resolves to nothing and the message is silently dropped.
- **`assertQueue` is not idempotent across different arguments.** If a queue already exists with different options (e.g. `durable` flipped), the broker throws `PRECONDITION_FAILED` and kills the channel. See `docs/tools/rabbitmq.md` for upgrade steps.
- **Prefetch is intentionally low** (set in the truncated `consumeFromQueue`) so that unacked messages are requeued promptly on consumer death rather than piling up.
