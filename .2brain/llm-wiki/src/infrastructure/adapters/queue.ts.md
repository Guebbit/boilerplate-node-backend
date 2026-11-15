---
source: src/infrastructure/adapters/queue.ts
sha256: ee76907a9b1baffcc08c2fd3edeafe1d3f984f4d9c3f34118ba7effc0a77d0cf
generated_at: 2026-11-14T17:54:56.849247+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/queue.ts

## Purpose

RabbitMQ (AMQP 0-9-1) adapter that provides `publishToQueue`, consumer registration, and graceful shutdown for the process. Every public function no-ops when the broker is unconfigured, letting callers fall back to inline work. Reconnection is handled entirely by `amqplib`'s built-in recovery (v2.0.1+), not by the project's own `managed-connection` lifecycle; only the shared warn-once latch is borrowed from that module.

## Key elements

- **`getAmqpUrl()`** — Assembles the AMQP URL from `queueConfig()` env vars; returns `undefined` when no port is set (queue-off signal). Encodes user/pass to handle special characters.
- **`isQueueEnabled()`** — Exported boolean guard callers check *before* building a job payload (e.g. `enqueueEmail` in `mailer.ts`).
- **`setupChannel(model)`** — The `recovery.setup` callback. Creates a **ConfirmChannel**, wires channel-level `error`/`close` handlers (with a 1 s backoff reopen for channel-only closes, and a non-retried hard-stop on `PRECONDITION_FAILED` 406), then calls `replayConsumers`.
- **`RECOVERY_OPTIONS` / `recoveryOptions()`** — Recovery config passed to `amqplib.connect`. Under test, `maxRetries: 0` so the event loop can exit; for job processes (see below) capped at `JOB_MAX_RETRIES = 3`.
- **`boundQueueRetries()`** — Exported; sets a flag so the next dial uses a bounded retry count. Called by the job runner, which has no forced-exit deadline.
- **`connectionGeneration`** — Bumped by `stopQueue`; a stale generation's connection is closed on arrival rather than kept.
- **`consumerTags` / `inFlightHandlers`** — Track registered consumers and in-flight handler Promises so `stopQueue` can cancel and drain them before closing.
- **`unavailabilityLog`** — Error-level, warn-once latch (shared with `managed-connection.ts`) reporting the outage exactly once, whether triggered by a failed publish or the `disconnect` event.

## Relationships

- **`src/infrastructure/adapters/config.ts`** — `queueConfig()` supplies all connection parameters (host, port, user, password, URL, enabled flag).
- **`src/infrastructure/adapters/managed-connection.ts`** — Provides `unavailabilityLatch` and the `DependencyStatus` type; the queue adapter deliberately does *not* reuse its reconnect lifecycle.
- **`src/infrastructure/adapters/logger.ts`** — All structured log output (errors for unavailability, `PRECONDITION_FAILED`, publish failures).
- **`src/infrastructure/observability/metrics-queue.ts`** — `queueJobsDeadLetteredTotal` counter incremented when a job is dead-lettered.
- **`src/infrastructure/runtime/config.ts`** — `isTestEnvironment()` gates `maxRetries: 0` in `RECOVERY_OPTIONS`.
- **`src/domain-primitives/time.ts`** — `DAY_MS` constant used for queue TTL / retry-delay arguments.
- **`src/infrastructure/adapters/mailer.ts`** — `enqueueEmail` checks `isQueueEnabled()` and falls back to sending inline when the queue is off.
- **`src/infrastructure/http/middlewares/upload.ts`** — `quarantineUploadedImages` and `enqueueImageDigest` degrade to inline work when the queue is unavailable (the latency cost the error-level latch callouts).
- **`scripts/ops/run-job.ts`** — Calls `boundQueueRetries()` before connecting, capping reconnect attempts for the finite job lifetime.
- **`src/infrastructure/runtime/server-lifecycle.ts`** — Invokes `stopQueue` during graceful shutdown to drain in-flight handlers and close the connection.

## Notes

- The adapter uses a **ConfirmChannel**, not a plain channel, so `publishToQueue` can distinguish a broker-refused publish from ordinary write-buffer backpressure via the broker's own ack/nack callback.
- Channel-level closes (e.g. `PRECONDITION_FAILED` during a queue-argument change) are *not* covered by amqplib's connection recovery; `setupChannel`'s `close` handler reopens the channel after a 1 s delay on the same connection.
- `PRECONDITION_FAILED` (406) is treated as a **non-retryable configuration mismatch**: it logs on every occurrence (bypassing the once-only latch) and stops retrying until a redeploy redeclares the queue.
- Under test, `maxRetries` is set to `0` because `.env` typically points at a Docker Compose hostname that resolves nowhere on the dev machine; without this the infinite retry timer would keep the test process alive.
- The recovery `setup` promise is intentionally **not awaited** by the caller; with recovery enabled it settles only after the first connect succeeds, and callers must treat "not yet available" as the normal pre-connect state.
