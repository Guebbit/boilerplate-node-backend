# src/infrastructure/adapters/queue.ts

## Purpose

RabbitMQ (AMQP 0-9-1) adapter providing publish and consume primitives over a single shared channel. Every public function degrades to a safe no-op when the broker is unconfigured, so callers (e.g. `enqueueEmail` in `mailer.ts`) can fall back to doing work inline without try/catch gymnastics.

## Key elements

- **`isQueueEnabled()`** — Exported gate: returns `true` only when an AMQP URL can be built *and* `NODE_RABBITMQ_ENABLED` is not set to false. Callers check this *before* constructing a job payload.
- **`queueConnection`** — A `manageConnection<Channel>` instance. Memoises the connect, shares in-flight attempts, and owns the two-step open (TCP connection → channel). Both halves are supervised by `superviseHandle` so an unhandled `error` never crashes the process.
- **`superviseHandle(handle, onClose)`** — Attaches `error` (→ `reportUnavailable`) and `close` (→ `onClose`) listeners to any `EventEmitter` (connection or channel). The `onClose` callback calls `queueConnection.forget()`, which is the entire reconnect strategy: demand-driven, no timers.
- **`startQueue()` / `stopQueue()`** — Lifecycle hooks. `startQueue` pays the handshake cost at boot; `stopQueue` flushes and closes the connection (implicitly closing its channel).
- **`queueState()`** — Returns a `DependencyStatus` for the health endpoint. No I/O; simply reports the managed-connection's current state.
- **`EMAIL_QUEUE` / `PDF_QUEUE`** — Queue-name constants sourced from `WORKER_CHANNELS` (generated from `asyncapi.yaml`).
- **`DEAD_LETTER_EXCHANGE` / `deadLetterQueueOf(queue)`** — Dead-letter naming convention. A `direct` exchange routes refusals to `<queue>.dead`, so `nack(msg, false, false)` means "moved for a human."
- **`assertJobQueue(ch, queue, durable)`** — Idempotent declaration of the DLQ exchange → DLQ queue → binding → work queue (with `x-dead-letter-*` args). Called on both publish and consume paths so producer/consumer can start in any order.
- **`PublishOptions<TPayload>` / `publishToQueue`** — Publishes to the default exchange (routing key = literal queue name). Returns `true` on acceptance, `false` when unavailable. Generic payload type is checked at the call site so producer and consumer share one contract.
- **`consumeFromQueue`** (truncated) — Consumes from a queue with a low `prefetch` to limit unacked messages on the consumer side.

## Relationships

- **`src/infrastructure/runtime/managed-connection.ts`** — Supplies the `manageConnection` factory that provides memoisation, shared in-flight connect, `forget`, `state`, and `stop` semantics. This adapter is a consumer of that pattern (same as `cache.ts`).
- **`src/infrastructure/runtime/environment.ts`** — `environmentFlag('NODE_RABBITMQ_ENABLED', true)` gates `isQueueEnabled`.
- **`src/infrastructure/observability/dependency-health.ts`** — Consumes `queueState()` to include RabbitMQ in the `GET /observability/health` payload.
- **`src/infrastructure/adapters/logger.ts`** — Import for structured logging (used via `queueConnection.reportUnavailable` path).
- **`src/infrastructure/adapters/mailer.ts`** — Primary producer: checks `isQueueEnabled`, then calls `publishToQueue<EmailJob>`; falls back to inline send on `false`.
- **`src/infrastructure/adapters/pdf.ts`** — Producer for `PDF_QUEUE`, same inline-fallback pattern.
- **`src/infrastructure/adapters/email.worker.ts` / `pdf.worker.ts`** — Consumers: call `consumeFromQueue` against their respective queue.
- **`src/app.ts` / `src/app/workers.ts` / `src/infrastructure/runtime/server-lifecycle.ts`** — Orchestrate `startQueue`/`stopQueue` during boot and graceful shutdown.
- **`src/types/index.ts`** — Exports `WORKER_CHANNELS`, the single source of truth for queue names.
- **`docs/tools/rabbitmq.md`** — Operational runbook (upgrading broker, `PRECONDITION_FAILED` recovery, dead-letter inspection).
- **`tests/unit/infrastructure/adapters/queue.test.ts`** — Unit tests for the adapter's no-op, enablement, and publish/consume paths.

## Notes

- **`isQueueEnabled` is exported, the URL builder is not.** This is intentional: callers need the boolean *before* deciding whether to build a payload, but should never assemble their own AMQP URL.
- **Channel vs. connection lifetime.** The managed-connection's "handle" is the channel, but the file keeps a separate `connection` reference because closing the connection is the only way to release the TCP socket. `stopQueue` closes the connection, not the channel.
- **Reconnect is demand-driven.** There is no back-off timer or reconnection loop. `forget()` on close simply drops the cached handle; the next `getChannel()` call re-opens. Under sustained outages this means every request pays the connect cost until the broker returns.
- **`assertJobQueue` ordering matters.** The DLQ binding is created *before* the work queue references the exchange. A work queue whose `x-dead-letter-exchange` points at a non-existent exchange silently drops refused messages.
- **`PRECONDITION_FAILED` kills the channel.** If the queue already exists with different arguments (e.g. after a code change), `assertQueue` throws and the channel is dead. See `docs/tools/rabbitmq.md` for the recovery procedure.
- **Publishes to the default exchange.** No custom exchanges are used for the inbound path; the only declared exchange (`dead-letter`) is broker-side outbound routing.
