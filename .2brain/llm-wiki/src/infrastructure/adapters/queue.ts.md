---
source: src/infrastructure/adapters/queue.ts
sha256: deecb262e199263c52ac1012fabea72cfcd9d5b8686ca80b5a495e468765f5c8
generated_at: 2026-09-27T14:07:56.011221+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/queue.ts

## Purpose

RabbitMQ (AMQP 0-9-1) adapter that provides publish/consume primitives over a single confirm channel. Every public function degrades to a no-op (or `false` return) when the broker is unconfigured, letting callers fall back to inline work. Reconnects are handled entirely by amqplib's built-in recovery loop rather than the shared `managed-connection` lifecycle.

## Key elements

- **`isQueueEnabled()`** — exported boolean; `true` when an AMQP URL can be assembled from env vars **and** `NODE_RABBITMQ_ENABLED` is not explicitly `false`. Callers (e.g. `mailer.enqueueEmail`) branch on this *before* building a job payload.
- **`getAmqpUrl()`** — internal; assembles `amqp://user:pass@host:port` from `NODE_RABBITMQ_*` fragments (user/pass URI-encoded) or returns the ready-made `NODE_RABBITMQ_URL`. Returns `undefined` when unconfigured.
- **`setupChannel(model)`** — amqplib recovery `setup` callback; creates a **confirm** channel, wires error/close handlers, re-binds all registered consumers, and stores the channel in `currentChannel`. Handles `PRECONDITION_FAILED` (406) by refusing to retry (config mismatch) and logs it every occurrence.
- **`ensureConnecting()`** — idempotent bootstrapper; fires `amqplib.connect(url, { recovery })` exactly once. The returned promise is intentionally **not** awaited so app boot never blocks on broker availability.
- **`RECOVERY_OPTIONS`** — passes `setupChannel` plus `maxRetries: 0` under `NODE_ENV=test` so a test process exits cleanly instead of retrying forever.
- **`currentChannel`** — module-level `ConfirmChannel | undefined`; the sole publish/consume session. `undefined` means "take the inline fallback path."
- **`consumerTags` / `inFlightHandlers`** — bookkeeping sets used by `stopQueue` to cancel consumers and await in-flight handler promises before closing.
- **`unavailabilityLog`** — warn-once latch (shared with `managed-connection`) that emits a single `error`-level log when the queue becomes unavailable, then a `info` on recovery.
- **`CHANNEL_REOPEN_DELAY_MS`** (1 000) — backoff before re-opening a channel that closed without the connection dropping.
- **`PRECONDITION_FAILED`** (406) — AMQP reply code treated as a terminal config error, not a transient blip.

## Relationships

- **`managed-connection.ts`** — imports `unavailabilityLatch` and the `DependencyStatus` type; deliberately does **not** use its reconnect lifecycle (RabbitMQ recovery is amqplib-native, Redis recovery is demand-driven).
- **`logger.ts`** — all diagnostic output (error/info) flows through this adapter's logger.
- **`mailer.ts`** — `enqueueEmail` calls `isQueueEnabled()` first; when the queue is down it sends the email inline instead of enqueuing a job envelope.
- **`email.worker.ts` / `image.worker.ts`** — consume jobs published to their respective queues; their handlers are tracked in `inFlightHandlers` for clean shutdown.
- **`upload.ts` (middleware)** — publishes image-digest / quarantine jobs to the queue.
- **`mail.ts` (account service)** — enqueues outbound email jobs via the queue adapter.
- **`reap-inactive-accounts.ts` / `sweep-reservations.ts`** — ops scripts that publish batch jobs to the queue.
- **`workers.ts`** — registers consumer handlers and wires them into the recovery `setup` replay path.
- **`app.ts` / `server-lifecycle.ts`** — call `stopQueue` (or equivalent teardown) during graceful shutdown; `settleWithin` (from `settle.ts`) bounds that await.
- **`metrics-queue.ts`** — exports `queueJobsDeadLetteredTotal`, incremented when a message is dead-lettered after exhausting retries.
- **`environment.ts`** — supplies `environmentFlag` / `environmentNumber` for `NODE_RABBITMQ_ENABLED` and numeric tuning knobs.

## Notes

- **Confirm channel, not plain channel.** `sendToQueue` on a plain channel returns a local buffer-full signal; only a confirm channel's broker acknowledgement lets `publishToQueue` distinguish a genuine publish failure from write-buffer backpressure.
- **Recovery is amqplib-internal, not `managed-connection`.** The `setup` callback is awaited before each (re)connect "counts as done," so `currentChannel` is guaranteed set by the time the connection resolves. The shared `managed-connection` lifecycle (demand-driven retry) is reserved for Redis.
- **`.unref()` discipline.** The channel-reopen timer and the recovery retry timer are both `.unref()`'d (or suppressed via `maxRetries: 0` in tests) so a missing broker never keeps a test process alive.
- **`guest`/`guest` defaults** only work over localhost; any non-localhost deployment must supply `NODE_RABBITMQ_USER`/`PASS` (passwords are `encodeURIComponent`'d because generated passwords routinely contain `@`, `/`, `#`).
- **Channel-only close vs. connection drop.** amqplib recovery reacts only to connection-level drops. A channel that closes on its own (e.g. a `PRECONDITION_FAILED` on re-declare) is handled by a separate `close` listener with its own backoff timer.
