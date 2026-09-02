# docs/tools/rabbitmq.md

## Purpose

Documents how the project uses RabbitMQ as an optional message broker to move heavy or unreliable work (emails, PDF generation) out of the HTTP request/response cycle into background queues, and how to publish, consume, configure, and operate that infrastructure.

## Key elements

- **`src/infrastructure/adapters/queue.ts`** — AMQP connection, `publishToQueue`, `consumeFromQueue`, queue-declaration helpers, dead-letter wiring, priority arguments.
- **`src/infrastructure/adapters/mailer.ts` → `enqueueEmail()`** — queue-aware dispatch; publishes to `worker.email.send` or falls back to direct `nodemailer()` call when the queue is disabled.
- **`src/infrastructure/adapters/email.worker.ts`** — consumer that drains `worker.email.send` and sends mail.
- **`src/infrastructure/adapters/pdf.worker.ts`** — consumer for async PDF generation jobs.
- **`src/app/workers.ts`** — registers all worker consumers at startup.
- **`src/app.ts`** — calls `startQueue` / `registerWorkers` on boot and `stopQueue` on graceful shutdown.
- **Queue name constants** (`EMAIL_QUEUE`, `PDF_QUEUE`) — aliases of `WORKER_CHANNELS.*`, generated from `asyncapi.yaml` so producer, consumer, and contract share one string.
- **Dead-letter setup** — every work queue gets a `dead-letter` direct exchange and a `<queue>.dead` queue; handler return values map to ack / nack (requeue) / nack (dead-letter).
- **Priority** — `x-max-priority: 1`; `'normal'` (0) vs `'high'` (1) for time-sensitive mail.
- **Env vars** — `NODE_RABBITMQ_URL` (preferred), individual `HOST`/`PORT`/`USER`/`PASS` fallbacks, `NODE_RABBITMQ_ENABLED=0` to force-disable. All unset → silent no-op.

## Relationships

- **`docs/tools/email-and-rendering.md`** — the primary consumer of this queue; controllers publish email jobs, the worker calls Nodemailer.
- **`docs/reference/src-infrastructure.md`** — hosts `queue.ts`, `mailer.ts`, `email.worker.ts`, `pdf.worker.ts` under `src/infrastructure/adapters/`.
- **`docs/reference/src-app.md`** — `src/app.ts` wires `startQueue`/`stopQueue`; `src/app/workers.ts` registers consumers.
- **`docs/api/asyncapi-workflow.md`** — queue names are generated from `asyncapi.yaml`, keeping producer/consumer/contract names in sync.
- **`docs/tools/docker-and-podman.md`** — `docker-compose.yml` defines the `rabbitmq` service (AMQP 5672, management UI 15672).
- **`docs/tools/runtime.md`** — graceful-shutdown sequence calls `stopQueue()` after the HTTP server closes.
- **`docs/tools/redis-cache.md`** — follows the same optional-infrastructure / silent-fallback pattern.

## Notes

- **Never hard-code queue names as string literals.** Use the `EMAIL_QUEUE` / `PDF_QUEUE` constants; a typo in a literal creates a message on a queue nobody reads, with no compile-time or runtime error.
- **Handler return semantics are strict:** `true` → ack (done); `false` → dead-lettered permanently (unrecoverable); reject/throw → requeued for retry (transient). Do not `return false` for a transient error.
- **Upgrading broker arguments** (e.g., adding dead-letter policy or `x-max-priority`) causes `PRECONDITION_FAILED` on an existing queue. Stop consumers, delete the old queues via `rabbitmqctl delete_queue …`, then restart the app so declarations are recreated.
- **Priority is approximate**, not a strict global ordering — RabbitMQ reorders only within its current buffer. Two levels exist by design.
- **All operations are durable by default** (`durable: true`, `persistent: true`) unless explicitly overridden.
- When RabbitMQ is fully unconfigured, the app runs identically to a queue-less deployment — no crash, no error.
