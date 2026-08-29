# docs/tools/rabbitmq.md

## Purpose

Documents how RabbitMQ is wired into the app as an optional message broker for offloading emails, PDF generation, and similar background work out of the request/response cycle. Serves as the single reference for the queue contract (queue names, dead-letter topology, publish/consume API) so contributors and AI assistants can add or modify workers without re-deriving the pattern.

## Key elements

- **`src/infrastructure/adapters/queue.ts`** — connection management, `publishToQueue()`, `consumeFromQueue()`, `startQueue()`, `stopQueue()`, and the `EMAIL_QUEUE` / `PDF_QUEUE` / `WORKER_CHANNELS` constants generated from `asyncapi.yaml`.
- **`src/infrastructure/adapters/mailer.ts`** — `enqueueEmail()` entry point; publishes to `worker.email.send` when enabled, falls back to direct `nodemailer()` call when disabled.
- **`src/infrastructure/adapters/email.worker.ts`** — consumer that drains `worker.email.send` and calls Nodemailer.
- **`src/infrastructure/adapters/pdf.worker.ts`** — consumer for async PDF generation jobs.
- **`src/app/workers.ts`** — registers all consumers at startup.
- **`src/app.ts`** — calls `startQueue` + `registerWorkers` on boot and `stopQueue` on graceful shutdown.
- **Dead-letter topology** — a `direct` exchange named `dead-letter` plus per-queue `<queue>.dead` queues; handler outcomes map to `ack` / `nack(requeue=false)` / `nack(requeue=true)`.
- **Env configuration** — `NODE_RABBITMQ_URL` (preferred) or individual `HOST`/`PORT`/`USER`/`PASS` vars; `NODE_RABBITMQ_ENABLED=0` forces disable. Absent config → silent no-op.

## Relationships

- **`src/infrastructure/adapters/queue.ts`** — the sole AMQP client wrapper; every other file in the graph imports from it.
- **`src/infrastructure/adapters/mailer.ts`** — calls `publishToQueue` (via `enqueueEmail`) to hand email jobs to the broker; is the producer-side integration point.
- **`src/infrastructure/adapters/email.worker.ts`** / **`src/infrastructure/adapters/pdf.worker.ts`** — consumers registered via `consumeFromQueue`; their `ack`/`nack`/reject behaviour drives the dead-letter flow documented here.
- **`src/app/workers.ts`** — calls the worker registration functions; without it, consumers are never started.
- **`src/app.ts`** — orchestrates lifecycle: `startQueue` → `registerWorkers` at boot; `stopQueue` after HTTP server close.
- **`docs/tools/runtime.md`** — describes the broader startup/shutdown sequence in which `startQueue`/`stopQueue` participate.
- **`docs/tools/redis-cache.md`** — follows the same "optional infrastructure, silent no-op when unconfigured" pattern; useful as a parallel reference.

## Notes

- **Never use string literals for queue names.** `EMAIL_QUEUE` and `PDF_QUEUE` are generated from `asyncapi.yaml`; a typo in a literal is a message on a queue nobody reads, with no error anywhere.
- **Handler return semantics are strict:** `true` → ack/delete; `false` → permanent dead-letter (use only for permanently unprocessable jobs); `reject` → requeue (use for transient failures). Confusing `false` with `reject` permanently loses the job.
- **Broker upgrade gotcha:** adding dead-letter arguments to an existing queue triggers `PRECONDITION_FAILED` and kills the channel. Must `rabbitmqctl delete_queue` the old queues (consumers stopped) before restarting; declarations are recreated on first publish.
- **Sync PDF path still exists:** `GET /orders/:id/invoice` renders inline (must return the file in the response); only *async* PDF jobs go through the queue.
- **Docker Compose** ships a `rabbitmq` service (AMQP `5672`, management UI `15672`, guest/guest) for local dev.
