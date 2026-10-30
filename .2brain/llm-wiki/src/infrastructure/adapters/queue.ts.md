---
source: src/infrastructure/adapters/queue.ts
sha256: 4e8fb3c6ab62fcb60e20e4851c31b2341c9ee3596dcedbb764a4d9aee69bccf9
generated_at: 2026-10-29T01:56:43.029348+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/queue.ts

## Purpose

RabbitMQ (AMQP 0-9-1) adapter that provides a single shared publish/consume channel for the process. When the broker is unconfigured or unreachable every operation degrades to a no-op (callers fall back to inline work). Connection resilience is delegated entirely to amqplib's built-in `recovery` option rather than the shared `managed-connection` lifecycle, because recovery's `setup` callback naturally re-declares queues and re-binds consumers on every reconnect.

## Key elements

- **`isQueueEnabled()`** (exported) — returns `true` when a RabbitMQ URL can be assembled from env and the queue is not explicitly disabled. Callers (e.g. `mailer.ts → enqueueEmail`) check this *before* building a job payload so they can skip envelope construction and send inline.
- **`getAmqpUrl()`** (internal) — assembles `amqp://user:pass@host:port` from `queueConfig()` fragments (encoding credentials) or returns the ready-made `NODE_RABBITMQ_URL`.
- **`setupChannel(model)`** (internal) — amqplib `recovery.setup` callback; creates a **confirm channel**, wires channel-level `error`/`close` handlers (with a 1 s reopen delay for channel-only closes), and re-registers all known consumers via `replayConsumers`. Runs after every successful (re)connect and is awaited by amqplib before the connect resolves.
- **`ensureConnecting()`** (internal) — idempotent guard that calls `amqplib.connect(url, { recovery })` at most once. The returned promise is intentionally fire-and-forget so a missing broker never blocks app boot.
- **`stopQueue()`** (referenced) — cancels all registered consumers, awaits in-flight handlers, then closes the recovering connection. Called during graceful shutdown.
- **`publishToQueue()`** (referenced) — publishes on the confirm channel; uses the broker's confirm callback (not `sendToQueue`'s local return) to distinguish a true publish failure from write-buffer backpressure. Returns `false` when no channel is available.
- **`consumerTags` / `inFlightHandlers`** — module-level `Set`s tracking live consumers and in-progress handler promises for orderly shutdown.
- **`RECOVERY_OPTIONS`** — passes `setup: setupChannel` and, in test environments, `maxRetries: 0` so an unreachable broker does not keep the event loop alive.

## Relationships

- **`src/infrastructure/adapters/config.ts`** — source of `queueConfig()` (env values for host, port, credentials, enabled flag).
- **`src/infrastructure/adapters/managed-connection.ts`** — supplies the shared `unavailabilityLatch` (warn-once latch) and `DependencyStatus` type; the Redis-specific lifecycle logic stays there.
- **`src/infrastructure/adapters/logger.ts`** — all log output (error on unavailability, info on recovery, error on `PRECONDITION_FAILED`).
- **`src/infrastructure/adapters/mailer.ts`** — primary inline-fallback caller: `enqueueEmail` checks `isQueueEnabled()` and, when `false`, sends the email directly instead of enqueuing.
- **`src/infrastructure/adapters/email.worker.ts` / `image.worker.ts`** — consumer-side workers registered on the channel via `replayConsumers`.
- **`src/infrastructure/http/middlewares/upload.ts`** — calls `quarantineUploadedImages` / `enqueueImageDigest`, which degrade to inline processing when the queue is down.
- **`src/infrastructure/observability/metrics-queue.ts`** — provides `queueJobsDeadLetteredTotal` counter incremented when a message is dead-lettered.
- **`src/domain-primitives/time.ts`** — supplies `DAY_MS` used as a retry/delay constant.
- **`src/infrastructure/runtime/config.ts`** — `isTestEnvironment()` gates `maxRetries: 0`.
- **`src/infrastructure/runtime/settle.ts`** — `settleWithin` used for bounded awaits.
- **`src/infrastructure/runtime/server-lifecycle.ts`** — calls `stopQueue()` during graceful shutdown.
- **`src/app.ts` / `src/app/workers.ts`** — application bootstrap that triggers `ensureConnecting` and registers worker consumers.
- **`scripts/ops/run-job.ts`** — operational script that connects as a consumer to process queued jobs.

## Notes

- **Confirm channel, not plain channel.** `sendToQueue` on a plain channel returns a local signal that conflates "broker accepted" with "write buffer full." The confirm channel's broker callback is the only reliable success/failure signal for `publishToQueue`.
- **Channel-only close vs. connection drop.** amqplib recovery reacts to *connection* loss. A channel can close independently (e.g. `PRECONDITION_FAILED`), in which case `setupChannel` re-opens a channel on the *same* connection after 1 s. `PRECONDITION_FAILED` (406) is a configuration mismatch and is **not** retried — it is logged every occurrence at `error` level.
- **Test-environment guard.** `maxRetries: 0` prevents amqplib's background retry loop (which is never `.unref()`'d) from keeping a test process alive. `.env` typically points at a Docker Compose hostname that does not resolve outside the compose network, so this is the routine local case, not an edge case.
- **Unavailability log is `error`, not `warn`.** Unlike the cache adapter (where a miss is a lost optimisation), a dead queue forces inline execution of image quarantine / email sending, which changes request latency and revives the unawaited-fallback race the inline path was written to avoid.
- **`replayConsumers` is a no-op on first boot** (no consumers registered yet) but is the mechanism that re-binds all consumers after a reconnect, since the old channel took them with it.
