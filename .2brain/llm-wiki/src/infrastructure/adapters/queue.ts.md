---
source: src/infrastructure/adapters/queue.ts
source_sha256: 1861d4d34ccf93116ab101b78254806d9eb17080bc11134bd010097392f0f989
context_sha256: 333b0aa6e6252391ec01b754752d2474564924103fd994ad3dd4ab8de04305ea
generated_at: 2026-11-22T02:41:38.666920+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/adapters/queue.ts

## Purpose
RabbitMQ (AMQP 0-9-1) adapter. It owns the process's single broker connection and channel, and it degrades to no-ops when the broker isn't configured (`publishToQueue` returns `false`). Producers don't call it directly for jobs. They go through `job-dispatch.ts`, which holds the job in a durable fallback queue when the broker is down, or tells the caller to run it inline when no broker is configured. Reconnection is delegated to amqplib's own `recovery` option rather than `managed-connection`'s lifecycle.

## Key elements
- `getAmqpUrl` (private): builds the connection URL from `queueConfig()`. `NODE_RABBITMQ_URL` wins. Otherwise it assembles one from user, password, host and port, with user and password URL-encoded. Without a port it returns `undefined`, which means the queue is off.
- `isQueueEnabled()`: exported. True when a URL is resolvable and `NODE_RABBITMQ_ENABLED` is set. Callers check it before building a payload (for example `enqueueEmail` sends inline instead).
- `currentChannel`: module-level `ConfirmChannel`, set on every (re)connect and cleared when its own channel closes. `undefined` means callers take the slow lane. Nothing waits for it.
- `recoveringConnection`, `connectionStarted`, `connectionGeneration`: connection handle, a guard so a burst of calls shares one dial, and a counter bumped by `stopQueue`. A connection that lands after a stop belongs to an old generation and is closed.
- `unavailabilityLog`: warn-once latch from `managed-connection`. It is shared by mid-flight publish failures and the `disconnect` event, and it logs at `error` level.
- `setupChannel(model)`: amqplib's recovery `setup`. It runs after every successful (re)connect and creates a confirm channel. It attaches `error` and `close` handlers, then calls `replayConsumers` to re-bind all known consumers.
  - On a channel-only close, it reopens after `CHANNEL_REOPEN_DELAY_MS` (1000 ms, `.unref()`'d timer).
  - On `PRECONDITION_FAILED` (406) it logs every time and does not retry.
- `RECOVERY_OPTIONS` / `recoveryOptions()`: recovery config with `setup: setupChannel`. `maxRetries: 0` under test. Capped at `JOB_MAX_RETRIES` (3) once bounded.
- `boundQueueRetries()`: exported. The job runner calls it so a one-shot process gives up on an unreachable broker instead of retrying forever.
- `consumerTags`, `inFlightHandlers`: track registered consumers (for cancelling) and running handlers (so `stopQueue` can let them finish).
- The code references `ensureConnecting`, `stopQueue`, `publishToQueue`, `replayConsumers` and `assertJobQueue`. Their implementations are beyond the visible portion of the file.

## Relationships
- **`config.ts`**: `queueConfig()` supplies the RabbitMQ URL, host, port, credentials and enabled flag.
- **`logger.ts`**: used for error logging on unavailability and `PRECONDITION_FAILED`.
- **`managed-connection.ts`**: supplies `unavailabilityLatch` and the `DependencyStatus` type. Its own lifecycle is deliberately not used here.
- **`metrics-queue.ts`**: imports `queueJobsDeadLetteredTotal`.
- **`time.ts`**: imports `DAY_MS`.
- **`job-dispatch.ts`**: the producer-side entry point that handles the broker-down and no-broker cases.
- **`job-drain.ts`, `email.worker.ts`, `image.worker.ts`, `workers.ts`, `process-boot.ts`, `run-job.ts`, `reapply-erasures.ts`, `upload.ts`, `mailer.ts`**: dependency-graph neighbors that use the queue. The visible portion doesn't show the specifics. `run-job.ts` is presumably the caller of `boundQueueRetries`, given the "job runner" wording. The file's comments name `enqueueEmail`, `quarantineUploadedImages` and `enqueueImageDigest` as callers that degrade to inline work.
- Also imports `isTestEnvironment` from `@infrastructure/runtime/config`, `settleWithin` from `@infrastructure/runtime/settle`, `WORKER_CHANNELS` from `@types`, and `getJson` from `@guebbit/js-toolkit`.

## Notes
- A dead queue is logged at `error`, not `warn`. Unlike the cache, callers fall back to running work inline, which changes request latency.
- Channel closes and connection drops are handled separately. Recovery only sees connection drops, so `setupChannel` reopens the channel itself.
- A confirm channel is used so a publish failure can be told apart from ordinary write-buffer backpressure.
- `.unref()` on timers and `maxRetries: 0` in tests keep processes from hanging on an unreachable broker.
- A `PRECONDITION_FAILED` close leaves queue work running inline until the queue is redeclared and the app restarted.
