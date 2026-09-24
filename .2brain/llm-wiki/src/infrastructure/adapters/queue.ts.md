---
source: src/infrastructure/adapters/queue.ts
sha256: 79b9fea3516e3ebbedd9bcd6e323d0ce519dab6d44b960c770b6a36789975089
generated_at: 2026-09-23T17:41:33.148121+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/queue.ts

## Purpose

RabbitMQ (AMQP 0-9-1) adapter that provides publish/consume primitives for the application's job queues. Every function degrades to a no-op when the broker is unconfigured, letting callers fall back to inline work. Reconnection is handled by amqplib's built-in `recovery` option rather than the shared `managed-connection` lifecycle, because recovery re-runs `setup` (channel creation + consumer re-binding) after every successful reconnect — exactly what this adapter needs.

## Key elements

- **`isQueueEnabled()`** (exported) — Returns `true` when a RabbitMQ URL is resolvable _and_ the `NODE_RABBITMQ_ENABLED` flag is not `false`. Callers (e.g. `mailer.ts → enqueueEmail`) check this _before_ building a job payload to skip envelope construction entirely.
- **`queueState()`** (exported) — Synchronous `DependencyStatus` (`'disabled' | 'ready' | 'unavailable'`) for the `/observability/health` endpoint. No I/O; simply inspects `currentChannel`.
- **`startQueue()`** (exported) — Kicks off the recovering connection at boot; never blocks (the amqplib promise settles only on first successful connect, which could be forever under `maxRetries: Infinity`).
- **`stopQueue()`** (exported, truncated) — Gracefully closes the recovering connection.
- **`setupChannel(model)`** (internal) — amqplib recovery `setup` callback. Creates a **confirm channel**, attaches `error`/`close` handlers (close triggers a 1 s backoff re-open on the same connection), sets `currentChannel`, and calls `replayConsumers`.
- **`ensureConnecting()`** (internal) — Idempotent nudge: if not yet started and the queue is enabled, fires `amqplib.connect(url, { recovery })` without awaiting. Attaches `connect`/`disconnect` listeners for log-latch clear/report.
- **`getChannel()`** (internal) — Calls `ensureConnecting()` then returns `currentChannel` or `undefined` (meaning "take the slow lane").
- **`RECOVERY_OPTIONS`** — Passes `setupChannel` as the setup hook; sets `maxRetries: 0` under `NODE_ENV=test` so a test process can exit cleanly when the broker is unreachable.
- **`CHANNEL_REOPEN_DELAY_MS`** (1000) — Backoff before re-opening a channel that closed while the connection stayed up (e.g. `PRECONDITION_FAILED` during broker restart).
- **`unavailabilityLog`** — Reuses `unavailabilityLatch` from `managed-connection.ts` to log an outage exactly once (via `logger.error`), shared between mid-flight publish failures and the connection's `disconnect` event.

## Relationships

- **`adapters/mailer.ts`** — `enqueueEmail` calls `isQueueEnabled()` before constructing a job envelope; if disabled it sends the email inline instead of publishing.
- **`adapters/image.worker.ts` / `adapters/email.worker.ts`** — Consumer-side workers that re-bind their channels via `replayConsumers` on each reconnect.
- **`adapters/managed-connection.ts`** — Provides the shared `unavailabilityLatch` and `DependencyStatus` type; does **not** manage this adapter's connection lifecycle (that is amqplib's job).
- **`adapters/logger.ts`** — All diagnostic output (`RabbitMQ unavailable…`, `RabbitMQ reachable again…`) goes through `logger`.
- **`runtime/environment.ts`** — `environmentFlag('NODE_RABBITMQ_ENABLED')` and `environmentNumber` gate whether the queue is active.
- **`observability/metrics-queue.ts`** — `queueJobsDeadLetteredTotal` counter is incremented when dead-lettered jobs are observed.
- **`modules/observability/services/dependency-health.ts`** — Calls `queueState()` to report RabbitMQ readiness in the health response.
- **`http/middlewares/upload.ts`** — Enqueues image-digest / quarantine jobs; degrades to inline work when `getChannel()` returns `undefined`.
- **`app.ts` / `app/workers.ts`** — Call `startQueue()` / `stopQueue()` during server lifecycle; register consumer bindings before the server accepts traffic.
- **`scripts/ops/reap-inactive-accounts.ts`** — Enqueues batch jobs through the same publish path.
- **`modules/observability/services/parked-jobs.ts`** — Reads dead-letter queue contents for operational visibility.

## Notes

- **Confirm channel, not plain channel.** `publishToQueue` relies on the broker's ack callback (available only on a `ConfirmChannel`) to distinguish a genuinely failed publish from ordinary write-buffer backpressure that `sendToQueue`'s local return value would mask.
- **`unref()` discipline.** Both the channel-close retry timer and (under test) the recovery timer are `.unref()`'d so they never hold the event loop open in tests or during graceful shutdown.
- **Test-mode recovery.** Under `NODE_ENV=test`, `maxRetries` is `0`: one connection attempt, then the adapter stays `unavailable` for the rest of the run. This is the routine local case because `.env` points at a Docker-Compose hostname unresolvable outside the network.
- **`getChannel()` never awaits.** It is synchronous by design; callers that need the queue simply get `undefined` and fall back. The connection dials in the background and `currentChannel` becomes available on a subsequent call.
- **Channel-only close ≠ connection drop.** amqplib's recovery only reacts to a full connection loss. A channel that closes on its own (e.g. `PRECONDITION_FAILED` mid-restart) is handled by the `close` handler's 1 s backoff re-open on the _same_ connection.
- **Config two-mode pattern.** A ready-made `NODE_RABBITMQ_URL` wins; otherwise the URL is assembled from `HOST`/`PORT`/`USER`/`PASS` (defaults: `127.0.0.1`, `guest`/`guest`). `NODE_RABBITMQ_PORT` is the one required fragment — without it the queue is off.
