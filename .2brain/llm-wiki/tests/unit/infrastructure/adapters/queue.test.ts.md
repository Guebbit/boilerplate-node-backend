---
source: tests/unit/infrastructure/adapters/queue.test.ts
sha256: cbb3c5a2f3f7de7f6d7735d28406ae38e72d5e020468f5d4763fc205a7aee190
generated_at: 2026-10-15T13:09:03.664052+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/queue.test.ts

## Purpose

Unit tests for the RabbitMQ queue adapter (`src/infrastructure/adapters/queue.ts`). Verifies connection lifecycle (start/stop/reconnect), the confirm-channel publish path, dead-letter parking, and environment-based enablement. The heavy mocking of `amqplib` (including its recovery protocol) lets the suite exercise adapter logic without a live broker.

## Key elements

- **Mirrored constants** (`QUORUM_QUEUE_TYPE`, `DEAD_LETER_ARGUMENTS`, `AT_LEAST_ONCE_DEAD_LETTERING`) — replicate `queue.ts`'s non-exported per-queue argument objects so assertions catch unintended changes.
- **`channelMock()` / `mockConnect` / `simulateReconnect`** — hand-rolled `amqplib` stubs. `mockConnect` replays the library's real contract (awaits `recovery.setup` before resolving). `simulateReconnect` re-runs `setup` then fires the `connect` event, mirroring `amqplib/lib/recovery.js`.
- **`mockSendToQueue`** — models the confirm-channel callback; the default invokes it synchronously (success). Tests override it to simulate backpressure (`return false` + success callback), broker refusal (error callback), or a never-arriving confirm.
- **`enableRabbitMQ` / `disableRabbitMQ`** — set/clear the `NODE_RABBITMQ_*` env vars via `setEnvironment`.
- **`ensureConnected`** — enables the queue, calls `stopQueue` → `startQueue`, then awaits the pending `mockConnect` promise so subsequent tests run against a "connected" channel.
- **`describe('isQueueEnabled()')`** — env-var detection, explicit disable, and URL credential encoding.
- **`describe('publishToQueue()')`** — success path (persistent, priority 4), backpressure-then-confirm, broker refusal, publish timeout, and disabled-queue no-op.
- Additional suites (truncated in source) cover `consumeFromQueue`, `parkedCounts`, dead-letter routing, and stop/cleanup.

## Relationships

- **`src/infrastructure/adapters/queue.ts`** — the system under test; every exported symbol in that file is exercised here.
- **`src/infrastructure/adapters/logger.ts`** — imported (likely for log-output assertions or to confirm no unhandled-exception logs leak).
- **`src/infrastructure/observability/metrics-queue.ts`** — `queueJobsDeadLetteredTotal` imported for dead-letter metric assertions.
- **`src/types/index.ts`** — provides `EmailJobPayloadSchema` and `WORKER_CHANNELS` used in payload/consumer tests.
- **`tests/support/environment.ts`** — `setEnvironment` is the single mechanism for mutating env vars across the suite.

## Notes

- Quorum-queue arguments are **mirrored, not imported**: they live as internal details of `assertJobQueue` in `queue.ts`. If those objects change, the mirrored constants here must be updated in lockstep or assertions will silently pass with wrong expectations.
- **Priority is 4, not 0.** A quorum queue treats an unmarked message as priority 4; `publishToQueue` must send `priority: 4` so "normal" messages are not ranked below unmarked ones.
- **Confirm-channel semantics:** `sendToQueue`'s boolean return is only a local write-buffer signal. The adapter waits for the broker's confirmation *callback*. A test that treats the boolean as success/failure would mask the double-run bug the confirm design prevents.
- **`parkedCounts` uses a separate plain channel** (`model.createChannel()`), distinct from the shared confirm channel. The mock models this explicitly so a broker error on the parking query cannot be confused with one on the publish path.
- **`ensureConnected` is required** because `queue.ts`'s `getChannel()` deliberately does not await the connection (documented as "rule 2" in that file). Tests that need a live channel must go through this helper.
- Reconnect simulation follows `amqplib`'s actual `recovery.js` ordering: `setup` is awaited **before** the `connect` event fires. Tests that fire the event first would not reflect real library behavior.
