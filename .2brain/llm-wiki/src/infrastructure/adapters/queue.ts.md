---
source: src/infrastructure/adapters/queue.ts
sha256: 534a05214cd8671081c202cef91c4c304ea6c8566f2139b335e96e78a43e2bf2
generated_at: 2026-10-14T07:48:11.394440+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/queue.ts

## Purpose

RabbitMQ (AMQP 0-9-1) adapter that provides publish/consume primitives over a single confirm channel. Every public function no-ops (or returns `false`) when the broker is unconfigured, letting callers degrade to inline work. Connection resilience is delegated entirely to `amqplib`'s built-in recovery option rather than `managed-connection`'s lifecycle.

## Key elements

- **`isQueueEnabled()`** (exported) — Returns `true` when a URL can be assembled *and* `NODE_RABBITMQ_ENABLED` is truthy. Callers check this before building a payload (e.g. `mailer.ts` → `enqueueEmail` sends inline instead of constructing a job envelope).
- **`getAmqpUrl()`** — Assembles an `amqp://` URL from `queueConfig()` env fragments; returns `undefined` when the port is absent (the "queue is off" signal).
- **`setupChannel(model)`** — The `recovery.setup` callback: opens a **confirm channel**, wires `error`/`close` handlers (including a 1 s reopen backoff for channel-only closes), sets `currentChannel`, and calls `replayConsumers`.
- **`ensureConnecting()`** — Idempotent guard that kicks off `amqplib.connect(url, { recovery })`. The returned promise is intentionally **not** awaited so boot never blocks on an unreachable broker.
- **`publishToQueue`** (implied by docblock) — Publishes on the confirm channel and uses the broker's ack callback to distinguish a genuine failure from local write-buffer backpressure.
- **`consumerTags` / `inFlightHandlers`** (module-local Sets) — Track registered consumers and in-flight handler promises so `stopQueue` can cancel consumers and await running handlers before closing.
- **`RECOVERY_OPTIONS`** — Passes `setupChannel` as `setup`; under test (`isTestEnvironment()`) sets `maxRetries: 0` so an unreachable broker doesn't keep the event loop alive.
- **`unavailabilityLog`** — A shared warn-once latch (sourced from `managed-connection`) that logs at `error` level; used by both mid-flight publish failures and the connection's `disconnect` event so the outage is reported exactly once.
- **`PRECONDITION_FAILED` (406) handling** — On a `close` with code 406, the adapter logs a persistent configuration-mismatch error and does **not** retry, since re-declaring with the same arguments will be refused again.

## Relationships

- **`adapters/config.ts`** — `queueConfig()` supplies every `NODE_RABBITMQ_*` env var used to build the URL and the `NODE_RABBITMQ_ENABLED` flag.
- **`adapters/managed-connection.ts`** — Reuses its `unavailabilityLatch` factory for the shared warn-once log; deliberately does **not** use its reconnect lifecycle (that stays with Redis).
- **`adapters/logger.ts`** — All structured log calls (`info`, `error`) go through this logger.
- **`adapters/mailer.ts`** — Calls `isQueueEnabled()` before building a job envelope; falls back to sending the email inline when the queue is off.
- **`adapters/email.worker.ts` / `adapters/image.worker.ts`** — Consume from the queues declared here; their handler promises are tracked in `inFlightHandlers`.
- **`http/middlewares/upload.ts`** — Publishes image-processing jobs (e.g. `quarantineUploadedImages`, `enqueueImageDigest`); degrades to inline work when the queue is unavailable.
- **`observability/metrics-queue.ts`** — Provides `queueJobsDeadLetteredTotal`, incremented when a message is dead-lettered.
- **`runtime/config.ts`** — `isTestEnvironment()` gates `maxRetries: 0` in recovery options.
- **`runtime/server-lifecycle.ts`** — Invokes `stopQueue` during graceful shutdown.
- **`app.ts` / `app/workers.ts`** — Boot path that registers consumers and wires the queue into the application lifecycle.
- **`scripts/ops/*`** (reap-inactive-accounts, sweep-preorders, sweep-reservations) — Publish operational jobs to the same queues.

## Notes

- The confirm channel is load-bearing: a plain channel's `sendToQueue` return value cannot distinguish "broker refused" from "local buffer full," which is why `publishToQueue` relies on the broker ack callback.
- `setupChannel` is awaited by amqplib before a reconnect counts as complete, so `currentChannel` is guaranteed set by the time recovery reports success.
- The channel `close` handler schedules a `.unref()`'d 1 s timer to reopen the channel on the *same* connection; if the connection itself is down, `createConfirmChannel` simply rejects and amqplib's own recovery will invoke `setupChannel` again after reconnecting.
- Under test, `maxRetries: 0` means a single failed connect leaves the queue permanently unavailable for the process lifetime—intentional, to avoid a background retry loop holding open test processes.
