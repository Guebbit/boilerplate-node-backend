---
source: src/infrastructure/adapters/queue.ts
sha256: c592be94ae92bbc0f1b093000131b34166d81dbf0f833da712ea77ea37a10f2c
generated_at: 2026-11-08T03:22:58.364858+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/queue.ts

## Purpose

RabbitMQ (AMQP 0-9-1) adapter that provides `publishToQueue` and consumer registration for the application. When the broker is unconfigured or unreachable, every function degrades to a no-op (`publishToQueue` returns `false`) so callers can fall back to inline work. Reconnection is handled entirely by amqplib's built-in `recovery` mechanism, which re-runs the `setup` callback after each successful reconnect to re-declare queues and re-bind consumers.

## Key elements

- **`getAmqpUrl()`** — Builds the AMQP connection URL from env vars (`NODE_RABBITMQ_*`); returns `undefined` when the queue is off. Encodes user/password to handle special characters.
- **`isQueueEnabled()`** *(exported)* — `true` when a URL can be assembled **and** `NODE_RABBITMQ_ENABLED` is not falsy. Callers (e.g. `mailer.ts`) branch on this *before* building a payload to decide inline-vs-queued.
- **`currentChannel: ConfirmChannel | undefined`** — The single channel for this process. A *confirm* channel so `publishToQueue` can distinguish a broker-refused publish from local back-pressure.
- **`setupChannel(model)`** — amqplib recovery `setup` callback. Creates a confirm channel, attaches `error`/`close` handlers (channel-only close triggers a 1 s reopen on the same connection; `PRECONDITION_FAILED`/406 is logged as a config error and **not** retried), sets `currentChannel`, and calls `replayConsumers`.
- **`RECOVERY_OPTIONS`** — `{ setup: setupChannel, maxRetries: 0 }` under test (so an unreachable broker doesn't keep the event loop alive); `{ setup: setupChannel }` in production (unlimited retries).
- **`ensureConnecting()`** — Idempotent guard; calls `amqplib.connect(url, { recovery })` exactly once and never awaits the resulting promise (it resolves only after the first successful connect + setup).
- **`replayConsumers(ch)`** — Re-binds every previously registered consumer on the fresh channel (no-op on first boot).
- **`stopQueue()`** — Cancels all consumer tags, awaits in-flight handlers, closes the connection. Called during graceful shutdown.
- **`unavailabilityLog`** — Warn-once latch (from `managed-connection`) that logs at **error** level: a dead queue changes request latency, not just an optimisation.
- **`consumerTags: Set<string>`** / **`inFlightHandlers: Set<Promise<unknown>>`** — Bookkeeping for graceful shutdown and channel re-open.
- **`PRECONDITION_FAILED = 406`** — AMQP code for "queue exists with different arguments"; treated as a deploy-fix, never auto-retried.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/infrastructure/adapters/config.ts` | Reads `queueConfig()` for all `NODE_RABBITMQ_*` env values. |
| `src/infrastructure/adapters/logger.ts` | Logs all lifecycle and error events. |
| `src/infrastructure/adapters/managed-connection.ts` | Reuses the shared `unavailabilityLatch` helper; does **not** use its connection lifecycle (recovery is amqplib-native here). |
| `src/infrastructure/adapters/mailer.ts` | Calls `isQueueEnabled()` / `publishToQueue` via `enqueueEmail`; falls back to inline send when the queue is off. |
| `src/infrastructure/adapters/email.worker.ts` | Registers a consumer on the email queue through this adapter. |
| `src/infrastructure/adapters/image.worker.ts` | Registers a consumer on the image queue through this adapter. |
| `src/infrastructure/http/middlewares/upload.ts` | Enqueues image-processing jobs; degrades to inline work when queue is unavailable. |
| `src/infrastructure/observability/metrics-queue.ts` | Imports `queueJobsDeadLetteredTotal` to increment on dead-letter events. |
| `src/infrastructure/runtime/config.ts` | Reads `isTestEnvironment()` to cap amqplib retries at 0 under test. |
| `src/infrastructure/runtime/server-lifecycle.ts` | Calls `stopQueue()` during graceful shutdown. |
| `src/app.ts` | Top-level app bootstrap; triggers initial queue setup and shutdown. |
| `src/app/workers.ts` | Wires worker consumers into the queue adapter at boot. |
| `src/domain-primitives/time.ts` | Imports `DAY_MS` for TTL / retry-delay calculations. |
| `scripts/ops/reapply-erasures.ts` | Operational script that publishes re-erasure jobs via `publishToQueue`. |
| `scripts/ops/run-job.ts` | Operational script that enqueues a one-off job through the queue. |

## Notes

- **Confirm channel, not plain channel.** `sendToQueue` on a plain channel returns a local buffer status; a confirm channel's callback fires only when the broker accepts or refuses the message. This is the only way to detect a true publish failure.
- **Never await the connection promise.** `ensureConnecting` fires `amqplib.connect` and drops the promise. Awaiting it would block app boot until the broker answers (retries forever in production).
- **Channel-only close ≠ connection close.** Recovery reacts only to connection drops. A channel that dies (e.g. `PRECONDITION_FAILED`) while the connection stays up is handled by a 1 s `setTimeout` + `.unref()` that re-runs `setupChannel` on the *same* connection.
- **`maxRetries: 0` under test.** amqplib's recovery timer is never `.unref()`'d, so an unreachable broker (the routine case in CI, where the compose hostname doesn't resolve) would keep the Node process alive. Capping retries at 0 makes the process exit cleanly after one failed attempt.
- **`unavailabilityLog` is `error`, not `warn`.** Unlike the cache adapter (where a miss is a lost optimisation), a dead queue changes request semantics — work runs inline, increasing latency and reviving unawaited-fallback races.
- **Exported `isQueueEnabled` is asymmetric.** The cache adapter does not export its equivalent; the queue one is exported specifically so `mailer.ts` can skip payload construction entirely when queuing is off.
